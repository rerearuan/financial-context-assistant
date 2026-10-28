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
  ConversationState,
  ResponsePlan,
  UserConstraints,
  ExploredAlternative,
} from "@/lib/financial-engine/types";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { demoSessions, demoMessages, DemoSession, DemoMessage } from "@/lib/demo-store";
import { sanitizeAmount } from "@/lib/financial-engine/validator";

export const dynamic = "force-dynamic";

function getInitialConversationState(action: FinancialAction): ConversationState {
  return {
    activePlan: action,
    exploredAlternatives: [],
    userProvidedFacts: {},
    userConstraints: {},
    openClarifications: [],
    confusionCount: 0,
    declinedDiscussion: false,
  };
}

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

  // Initialize or retrieve conversation state
  let convState: ConversationState = demoSess.conversationState || getInitialConversationState(actionBefore);

  // Update confusion count
  if (intent.intentType === "confusion") {
    convState.confusionCount += 1;
  } else {
    convState.confusionCount = 0;
  }

  // Update declined flag
  if (intent.intentType === "decline_discussion") {
    convState.declinedDiscussion = true;
  }

  // Update constraints
  if (intent.userConstraints) {
    convState.userConstraints = {
      ...convState.userConstraints,
      ...intent.userConstraints,
    };
  }

  // Determine updated action
  const updatedAction = { ...demoSess.currentAction };
  let targetAmount = actionBefore.amount;

  if (intent.relativeDelta !== null && intent.relativeDelta !== undefined) {
    targetAmount = Math.max(0, actionBefore.amount + intent.relativeDelta);
    updatedAction.amount = targetAmount;
    updatedAction.modifiedByUser = true;
    convState.exploredAlternatives.push({
      amount: targetAmount,
      type: actionBefore.type,
      label: `Modifikasi relatif (${intent.relativeDelta > 0 ? "+" : ""}${intent.relativeDelta})`,
      timestamp: new Date().toISOString(),
    });
  } else if (intent.newAmount && intent.newAmount > 0 && intent.newAmount !== actionBefore.amount) {
    targetAmount = intent.newAmount;
    updatedAction.amount = targetAmount;
    updatedAction.modifiedByUser = true;
    convState.exploredAlternatives.push({
      amount: targetAmount,
      type: actionBefore.type,
      label: "Modifikasi nominal langsung",
      timestamp: new Date().toISOString(),
    });
  }
  demoSess.currentAction = updatedAction;
  convState.activePlan = {
    type: updatedAction.type as "spending" | "saving",
    amount: updatedAction.amount as number,
    timing: updatedAction.timing as string,
    targetCategory: updatedAction.targetCategory as string,
    description: updatedAction.description as string,
    source: updatedAction.modifiedByUser ? "user_message" : "scenario",
  };

  // Update user provided finances
  let userProvidedFinances: UserProvidedFinances | null = null;
  const existingDetails = demoSess.currentAction.userProvidedDetails as Record<string, unknown> | undefined;

  if (intent.userProvidedFinances) {
    userProvidedFinances = {
      balance: intent.userProvidedFinances.balance ?? (existingDetails?.balance as number | undefined),
      budget: intent.userProvidedFinances.budget ?? (existingDetails?.budget as number | undefined),
      income: intent.userProvidedFinances.income ?? (existingDetails?.income as number | undefined),
      liabilities: intent.userProvidedFinances.liabilities ?? (existingDetails?.liabilities as number | undefined),
      buffer: intent.userProvidedFinances.buffer ?? (existingDetails?.buffer as number | undefined),
      routine: intent.userProvidedFinances.routine ?? (existingDetails?.routine as number | undefined),
      goals: intent.userProvidedFinances.goals ?? (existingDetails?.goals as string | undefined),
      source: "user_message",
    };
    convState.userProvidedFacts = { ...convState.userProvidedFacts, ...userProvidedFinances };
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
      buffer: existingDetails.buffer as number | undefined,
      routine: existingDetails.routine as number | undefined,
      goals: existingDetails.goals as string | undefined,
      source: "user_message",
    };
  }

  // Response Plan
  const responsePlan: ResponsePlan = {
    intentType: intent.intentType,
    focalDimension: intent.focalDimension,
    isAlternativeOnly: Boolean(intent.isAlternativeOnly),
    simplifyExplanation: convState.confusionCount > 0 || intent.intentType === "confusion",
    avoidQuestionnaireRepeat: demoSess.condition === "basic" && demoSess.followupCount > 0,
    honoredConstraints: convState.userConstraints.prohibitCertificationFunds
      ? ["prohibitCertificationFunds"]
      : [],
    clarificationToAsk:
      demoSess.condition === "basic" && demoSess.followupCount === 0
        ? "Berapa perkiraan saldo kas rekening yang Anda miliki saat ini?"
        : null,
  };

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
      routineExpenses: pkg.syntheticProfile.routineExpenses as any,
      incomeSchedule: pkg.syntheticProfile.incomeSchedule as any,
      transactions: (pkg.syntheticProfile as any).transactions,
      installmentPlan: (pkg.syntheticProfile as any).installmentPlan,
      source: "synthetic_profile",
    };
  }

  const contextPacket = buildStructuredContextPacket({
    condition: demoSess.condition,
    action: convState.activePlan,
    syntheticProfile: syntheticProfileContext,
    userProvidedFinances,
    conversationState: convState,
    userConstraints: convState.userConstraints,
    responsePlan,
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
      latencyMs: assistantResult.latencyMs,
      promptVersion: assistantResult.promptVersion,
      modelUsed: assistantResult.modelUsed,
      validationResult: assistantResult.validationResult,
    } as unknown as Record<string, unknown>,
    sourcesUsed: contextPacket.dataSources,
  };
  existingMsgs.push(assistantMsg);
  demoMessages.set(sessionId, existingMsgs);
  demoSess.followupCount += 1;
  demoSess.conversationState = convState;

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
    latencyMs: assistantResult.latencyMs,
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

    // 2. Fetch official session from database
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
            currentAction: pkg.scenario.initialAction as unknown as Record<string, unknown>,
            status: "in_progress",
            followupCount: 0,
            maxFollowupAllowed: 5,
            promptVersion: "v2.2.0",
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

    // 4. Extract Intent & Check Action Modifications
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

    // Handle session state
    const existingDetails = session.currentAction.userProvidedDetails as Record<string, unknown> | undefined;
    let convState: ConversationState = (session.currentAction as any).conversationState || getInitialConversationState(actionBefore);

    if (intent.intentType === "confusion") {
      convState.confusionCount += 1;
    } else {
      convState.confusionCount = 0;
    }

    if (intent.intentType === "decline_discussion") {
      convState.declinedDiscussion = true;
    }

    if (intent.userConstraints) {
      convState.userConstraints = {
        ...convState.userConstraints,
        ...intent.userConstraints,
      };
    }

    const updatedAction = { ...session.currentAction };
    if (intent.relativeDelta !== null && intent.relativeDelta !== undefined) {
      const targetAmount = Math.max(0, actionBefore.amount + intent.relativeDelta);
      updatedAction.amount = targetAmount;
      updatedAction.modifiedByUser = true;
      convState.exploredAlternatives.push({
        amount: targetAmount,
        type: actionBefore.type,
        label: `Modifikasi relatif (${intent.relativeDelta > 0 ? "+" : ""}${intent.relativeDelta})`,
        timestamp: new Date().toISOString(),
      });
    } else if (intent.newAmount && intent.newAmount > 0 && intent.newAmount !== actionBefore.amount) {
      updatedAction.amount = intent.newAmount;
      updatedAction.modifiedByUser = true;
      convState.exploredAlternatives.push({
        amount: intent.newAmount,
        type: actionBefore.type,
        label: "Modifikasi nominal",
        timestamp: new Date().toISOString(),
      });
    }
    convState.activePlan = {
      type: updatedAction.type,
      amount: updatedAction.amount,
      timing: updatedAction.timing,
      targetCategory: updatedAction.targetCategory,
      description: updatedAction.description,
      source: updatedAction.modifiedByUser ? "user_message" : "scenario",
    };

    let userProvidedFinances: UserProvidedFinances | null = null;
    if (intent.userProvidedFinances) {
      userProvidedFinances = {
        balance: intent.userProvidedFinances.balance ?? (existingDetails?.balance as number | undefined),
        budget: intent.userProvidedFinances.budget ?? (existingDetails?.budget as number | undefined),
        income: intent.userProvidedFinances.income ?? (existingDetails?.income as number | undefined),
        liabilities: intent.userProvidedFinances.liabilities ?? (existingDetails?.liabilities as number | undefined),
        buffer: intent.userProvidedFinances.buffer ?? (existingDetails?.buffer as number | undefined),
        routine: intent.userProvidedFinances.routine ?? (existingDetails?.routine as number | undefined),
        goals: intent.userProvidedFinances.goals ?? (existingDetails?.goals as string | undefined),
        source: "user_message",
      };
      convState.userProvidedFacts = { ...convState.userProvidedFacts, ...userProvidedFinances };
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
        buffer: existingDetails.buffer as number | undefined,
        routine: existingDetails.routine as number | undefined,
        goals: existingDetails.goals as string | undefined,
        source: "user_message",
      };
    }

    (updatedAction as any).conversationState = convState;

    // Response Plan
    const responsePlan: ResponsePlan = {
      intentType: intent.intentType,
      focalDimension: intent.focalDimension,
      isAlternativeOnly: Boolean(intent.isAlternativeOnly),
      simplifyExplanation: convState.confusionCount > 0 || intent.intentType === "confusion",
      avoidQuestionnaireRepeat: session.condition === "basic" && session.followupCount > 0,
      honoredConstraints: convState.userConstraints.prohibitCertificationFunds
        ? ["prohibitCertificationFunds"]
        : [],
      clarificationToAsk:
        session.condition === "basic" && session.followupCount === 0
          ? "Berapa perkiraan saldo kas rekening yang Anda miliki saat ini?"
          : null,
    };

    // 5. Retrieve Context strictly by Condition (Profile Access Guardrail)
    let syntheticProfileContext: FinancialProfileContext | null = null;

    if (session.condition === "context_aware") {
      const [profile] = await db
        .select()
        .from(syntheticProfiles)
        .where(eq(syntheticProfiles.scenarioId, session.scenarioId));

      if (profile) {
        const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === session.scenarioId);
        syntheticProfileContext = {
          totalCashBalance: profile.totalCashBalance,
          liquidBalance: profile.liquidBalance,
          allocations: pkg?.syntheticProfile?.allocations,
          budgets: profile.budgets,
          liabilities: profile.liabilities,
          goals: profile.goals,
          buffer: profile.buffer,
          routineExpenses: (profile as any).routineExpenses || pkg?.syntheticProfile?.routineExpenses,
          incomeSchedule: profile.incomeSchedule,
          transactions: pkg?.syntheticProfile?.transactions,
          laptopOffer: pkg?.syntheticProfile?.laptopOffer,
          h0Date: pkg?.scenario.h0Date,
          source: "synthetic_profile",
        };
      }
    }

    // 6. Package Context & Compute Deterministic Financial Consequences
    const contextPacket = buildStructuredContextPacket({
      condition: session.condition as "basic" | "context_aware",
      action: convState.activePlan,
      syntheticProfile: syntheticProfileContext,
      userProvidedFinances,
      conversationState: convState,
      userConstraints: convState.userConstraints,
      responsePlan,
    });

    // 7. Fetch strictly session-scoped chat history
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

    // 9. Save Assistant Message, Calculation Snapshot, and Metadata
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
        responseSource: assistantResult.responseSource,
        retryCount: assistantResult.retryCount,
        latencyMs: assistantResult.latencyMs,
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
      latencyMs: assistantResult.latencyMs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Chat API error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
