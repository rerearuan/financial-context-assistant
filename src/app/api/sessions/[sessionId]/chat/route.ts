import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, messages, syntheticProfiles } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import crypto from "crypto";
import { extractIntent, generateAssistantResponse, getGeminiModel } from "@/lib/gemini";
import { buildStructuredContextPacket } from "@/lib/financial-engine/context-packager";
import {
  FinancialAction,
  FinancialProfileContext,
  UserProvidedFinances,
} from "@/lib/financial-engine/types";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { demoSessions, demoMessages, DemoSession, DemoMessage } from "@/lib/demo-store";
import { sanitizeAmount } from "@/lib/financial-engine/validator";

export const dynamic = "force-dynamic";

async function handleDemoChat(demoSess: DemoSession, sessionId: string, messageText: string) {
  const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === demoSess.scenarioId);
  const userMsgId = `msg_u_${crypto.randomBytes(8).toString("hex")}`;
  const actionBefore: FinancialAction = {
    type: (demoSess.currentAction.type as "spending" | "saving") || "spending",
    amount: (demoSess.currentAction.amount as number) || 0,
    timing: (demoSess.currentAction.timing as string) || "",
    targetCategory: (demoSess.currentAction.targetCategory as string) || "",
    description: (demoSess.currentAction.description as string) || "",
    source: "scenario",
  };

  const intent = await extractIntent(messageText, actionBefore);

  const updatedAction = { ...demoSess.currentAction };
  if (intent.newAmount && intent.newAmount > 0 && intent.newAmount !== actionBefore.amount) {
    updatedAction.amount = intent.newAmount;
    updatedAction.modifiedByUser = true;
  }
  demoSess.currentAction = updatedAction;

  let userProvidedFinances: UserProvidedFinances | null = null;
  const existingDetails = demoSess.currentAction.userProvidedDetails as Record<string, unknown> | undefined;

  if (intent.userProvidedFinances) {
    userProvidedFinances = {
      balance: intent.userProvidedFinances.balance ?? (existingDetails?.balance as number | undefined),
      budget: intent.userProvidedFinances.budget ?? (existingDetails?.budget as number | undefined),
      income: intent.userProvidedFinances.income ?? (existingDetails?.income as number | undefined),
      liabilities: intent.userProvidedFinances.liabilities ?? (existingDetails?.liabilities as number | undefined),
      goals: intent.userProvidedFinances.goals ?? (existingDetails?.goals as string | undefined),
      source: "user_message",
    };
    demoSess.currentAction.userProvidedDetails = {
      ...existingDetails,
      ...userProvidedFinances,
    };
  } else if (existingDetails) {
    userProvidedFinances = {
      balance: existingDetails.balance as number | undefined,
      budget: existingDetails.budget as number | undefined,
      income: existingDetails.income as number | undefined,
      liabilities: existingDetails.liabilities as number | undefined,
      goals: existingDetails.goals as string | undefined,
      source: "user_message",
    };
  }

  // Server-side permission check: Basic NEVER receives synthetic profile
  let syntheticProfileContext: FinancialProfileContext | null = null;
  if (demoSess.condition === "context_aware" && pkg?.syntheticProfile) {
    syntheticProfileContext = {
      totalCashBalance: pkg.syntheticProfile.totalCashBalance,
      liquidBalance: pkg.syntheticProfile.liquidBalance,
      budgets: pkg.syntheticProfile.budgets as any,
      liabilities: pkg.syntheticProfile.liabilities as any,
      goals: pkg.syntheticProfile.goals as any,
      buffer: pkg.syntheticProfile.buffer as any,
      incomeSchedule: pkg.syntheticProfile.incomeSchedule as any,
      source: "synthetic_profile",
    };
  }

  const contextPacket = buildStructuredContextPacket({
    condition: demoSess.condition,
    action: {
      type: updatedAction.type as "spending" | "saving",
      amount: updatedAction.amount as number,
      timing: updatedAction.timing as string,
      targetCategory: updatedAction.targetCategory as string,
      description: updatedAction.description as string,
      source: updatedAction.modifiedByUser ? "user_message" : "scenario",
    },
    syntheticProfile: syntheticProfileContext,
    userProvidedFinances,
  });

  const existingMsgs = demoMessages.get(sessionId) || [];
  existingMsgs.push({
    id: userMsgId,
    sessionId,
    role: "user",
    content: messageText,
    createdAt: new Date(),
    sourcesUsed: ["user_message"],
    extractedIntent: intent as any,
  });

  const chatHistory = existingMsgs.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const assistantResult = await generateAssistantResponse(
    contextPacket,
    messageText,
    chatHistory
  );

  const assistantMsgId = `msg_a_${crypto.randomBytes(8).toString("hex")}`;
  const assistantMsg: DemoMessage = {
    id: assistantMsgId,
    sessionId,
    role: "assistant",
    content: assistantResult.content,
    createdAt: new Date(),
    calculationSnapshot: {
      ...contextPacket.calculation,
      isFallback: assistantResult.isFallback,
      responseSource: assistantResult.responseSource,
      retryCount: assistantResult.retryCount,
      promptVersion: assistantResult.promptVersion,
      modelUsed: assistantResult.modelUsed,
      validationResult: assistantResult.validationResult,
    } as unknown as Record<string, unknown>,
    sourcesUsed: contextPacket.dataSources,
  };
  existingMsgs.push(assistantMsg);
  demoMessages.set(sessionId, existingMsgs);
  demoSess.followupCount += 1;

  return NextResponse.json({
    assistantMessage: {
      id: assistantMsgId,
      role: "assistant",
      content: assistantResult.content,
      createdAt: new Date().toISOString(),
    },
    reply: assistantResult.content,
    messageId: assistantMsgId,
    calculationSnapshot: contextPacket.calculation,
    updatedAction,
    followupCount: demoSess.followupCount,
    maxFollowupAllowed: demoSess.maxFollowupAllowed,
    isFallback: assistantResult.isFallback,
    responseSource: assistantResult.responseSource,
    retryCount: assistantResult.retryCount,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await req.json();
    const { message } = body;

    // 1. Input Validation Guardrail
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Pesan tidak boleh kosong." },
        { status: 400 }
      );
    }

    if (message.length > 1000) {
      return NextResponse.json(
        { error: "Panjang pesan melebihi batas 1.000 karakter." },
        { status: 400 }
      );
    }

    // 2. Fetch official session from database (Session Isolation Guardrail)
    let session = null;
    try {
      const [dbSession] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId));
      session = dbSession;
    } catch (err) {
      console.warn("DB not reachable in chat route, falling back to demo store:", err);
    }

    if (!session) {
      const demoSess = demoSessions.get(sessionId);
      if (demoSess) {
        return handleDemoChat(demoSess, sessionId, message.trim());
      }

      const devMatch = sessionId.match(/^dev_(.+?)_(basic|context_aware)$/);
      if (devMatch) {
        const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === devMatch[1]);
        if (pkg) {
          const fakeDevSess: DemoSession = {
            id: sessionId,
            participantCode: `DEV-${devMatch[1].toUpperCase()}`,
            scenarioId: pkg.scenario.id,
            condition: devMatch[2] as "basic" | "context_aware",
            currentAction: pkg.scenario.initialAction as Record<string, unknown>,
            status: "in_progress",
            followupCount: 0,
            maxFollowupAllowed: 5,
            promptVersion: "v2.0.0",
            modelId: getGeminiModel(),
          };
          return handleDemoChat(fakeDevSess, sessionId, message.trim());
        }
      }

      return NextResponse.json(
        { error: "Sesi tidak valid atau tidak ditemukan." },
        { status: 404 }
      );
    }

    if (session.status !== "in_progress") {
      return NextResponse.json(
        {
          error: "Sesi ini telah selesai dengan keputusan: " + session.status,
          sessionStatus: session.status,
        },
        { status: 400 }
      );
    }

    // 3. Insert User Message
    const userMsgId = `msg_u_${crypto.randomBytes(8).toString("hex")}`;
    await db.insert(messages).values({
      id: userMsgId,
      sessionId,
      role: "user",
      content: message.trim(),
      sourcesUsed: ["user_message"],
    });

    // 4. Extract Intent & Check Action Modifications (Structured Extraction)
    const actionBefore: FinancialAction = {
      type: session.currentAction.type,
      amount: session.currentAction.amount,
      timing: session.currentAction.timing,
      targetCategory: session.currentAction.targetCategory,
      description: session.currentAction.description,
      source: "scenario",
    };

    const intent = await extractIntent(message.trim(), actionBefore);

    // Save extracted intent to user message record
    await db
      .update(messages)
      .set({ extractedIntent: intent })
      .where(eq(messages.id, userMsgId));

    // Handle nominal modification if user specified a new amount
    const updatedAction = { ...session.currentAction };
    if (intent.newAmount && intent.newAmount > 0 && intent.newAmount !== actionBefore.amount) {
      updatedAction.amount = intent.newAmount;
      updatedAction.modifiedByUser = true;
    }

    // Handle user-provided financial info
    let userProvidedFinances: UserProvidedFinances | null = null;
    const existingDetails = session.currentAction.userProvidedDetails as Record<string, unknown> | undefined;

    if (intent.userProvidedFinances) {
      userProvidedFinances = {
        balance: intent.userProvidedFinances.balance ?? (existingDetails?.balance as number | undefined),
        budget: intent.userProvidedFinances.budget ?? (existingDetails?.budget as number | undefined),
        income: intent.userProvidedFinances.income ?? (existingDetails?.income as number | undefined),
        liabilities: intent.userProvidedFinances.liabilities ?? (existingDetails?.liabilities as number | undefined),
        goals: intent.userProvidedFinances.goals ?? (existingDetails?.goals as string | undefined),
        source: "user_message",
      };
      updatedAction.userProvidedDetails = {
        ...existingDetails,
        ...userProvidedFinances,
      };
    } else if (existingDetails) {
      userProvidedFinances = {
        balance: existingDetails.balance as number | undefined,
        budget: existingDetails.budget as number | undefined,
        income: existingDetails.income as number | undefined,
        liabilities: existingDetails.liabilities as number | undefined,
        goals: existingDetails.goals as string | undefined,
        source: "user_message",
      };
    }

    // 5. Retrieve Context strictly by Condition (Profile Access Guardrail)
    let syntheticProfileContext: FinancialProfileContext | null = null;

    if (session.condition === "context_aware") {
      const [profile] = await db
        .select()
        .from(syntheticProfiles)
        .where(eq(syntheticProfiles.scenarioId, session.scenarioId));

      if (profile) {
        syntheticProfileContext = {
          totalCashBalance: profile.totalCashBalance,
          liquidBalance: profile.liquidBalance,
          budgets: profile.budgets,
          liabilities: profile.liabilities,
          goals: profile.goals,
          buffer: profile.buffer,
          incomeSchedule: profile.incomeSchedule,
          source: "synthetic_profile",
        };
      }
    }

    // 6. Package Context & Compute Deterministic Financial Consequences (Deterministic Engine)
    const contextPacket = buildStructuredContextPacket({
      condition: session.condition as "basic" | "context_aware",
      action: {
        type: updatedAction.type,
        amount: updatedAction.amount,
        timing: updatedAction.timing,
        targetCategory: updatedAction.targetCategory,
        description: updatedAction.description,
        source: updatedAction.modifiedByUser ? "user_message" : "scenario",
      },
      syntheticProfile: syntheticProfileContext,
      userProvidedFinances,
    });

    // 7. Fetch strictly session-scoped chat history (Session Isolation Guardrail)
    const allSessionMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt));

    const chatHistory = allSessionMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // 8. Generate Grounded Explanation with Output Guardrail & Retry Harness
    const assistantResult = await generateAssistantResponse(
      contextPacket,
      message.trim(),
      chatHistory
    );

    // 9. Save Assistant Message, Calculation Snapshot, and Harness Metadata
    const assistantMsgId = `msg_a_${crypto.randomBytes(8).toString("hex")}`;
    const newFollowupCount = session.followupCount + 1;

    await db.insert(messages).values({
      id: assistantMsgId,
      sessionId,
      role: "assistant",
      content: assistantResult.content,
      calculationSnapshot: {
        ...contextPacket.calculation,
        isFallback: assistantResult.isFallback,
        retryCount: assistantResult.retryCount,
        promptVersion: assistantResult.promptVersion,
        modelUsed: assistantResult.modelUsed,
        validationResult: assistantResult.validationResult,
      } as unknown as Record<string, unknown>,
      sourcesUsed: contextPacket.dataSources,
    });

    // 10. Update Session state
    await db
      .update(sessions)
      .set({
        currentAction: updatedAction,
        followupCount: newFollowupCount,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    return NextResponse.json({
      assistantMessage: {
        id: assistantMsgId,
        role: "assistant",
        content: assistantResult.content,
        createdAt: new Date().toISOString(),
      },
      reply: assistantResult.content,
      messageId: assistantMsgId,
      calculationSnapshot: contextPacket.calculation,
      updatedAction,
      followupCount: newFollowupCount,
      maxFollowupAllowed: session.maxFollowupAllowed,
      isFallback: assistantResult.isFallback,
      responseSource: assistantResult.responseSource,
      retryCount: assistantResult.retryCount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Chat API error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
