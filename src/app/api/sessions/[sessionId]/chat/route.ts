import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, messages, syntheticProfiles } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import crypto from "crypto";
import { extractIntent, generateAssistantResponse } from "@/lib/gemini";
import { buildStructuredContextPacket } from "@/lib/financial-engine/context-packager";
import {
  FinancialAction,
  FinancialProfileContext,
  UserProvidedFinances,
} from "@/lib/financial-engine/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await req.json();
    const { message } = body;

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

    // 1. Fetch official session from database (never trust client)
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (!session) {
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

    // 2. Insert User Message
    const userMsgId = `msg_u_${crypto.randomBytes(8).toString("hex")}`;
    await db.insert(messages).values({
      id: userMsgId,
      sessionId,
      role: "user",
      content: message.trim(),
      sourcesUsed: ["user_message"],
    });

    // 3. Extract Intent & Check Action Modifications
    const actionBefore: FinancialAction = {
      type: session.currentAction.type,
      amount: session.currentAction.amount,
      timing: session.currentAction.timing,
      targetCategory: session.currentAction.targetCategory,
      description: session.currentAction.description,
      source: "scenario",
    };

    const intent = await extractIntent(message.trim(), actionBefore);

    // Save extracted intent to the user message record
    await db
      .update(messages)
      .set({ extractedIntent: intent })
      .where(eq(messages.id, userMsgId));

    // Handle nominal modification if user specified a new amount
    let updatedAction = { ...session.currentAction };
    if (intent.newAmount && intent.newAmount > 0 && intent.newAmount !== actionBefore.amount) {
      updatedAction.amount = intent.newAmount;
      updatedAction.modifiedByUser = true;
    }

    // Handle user-provided financial info (especially for Basic condition)
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

    // 4. Retrieve Context strictly by Condition
    let syntheticProfileContext: FinancialProfileContext | null = null;

    if (session.condition === "context_aware") {
      // Context-Aware: retrieve official synthetic profile
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
    // NOTICE: For Basic condition, syntheticProfileContext remains strictly null!

    // 5. Package Context & Compute Deterministic Financial Consequences
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

    // 6. Fetch strictly session-scoped chat history
    const allSessionMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt));

    const chatHistory = allSessionMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // 7. Generate Grounded Explanation
    const assistantResult = await generateAssistantResponse(
      contextPacket,
      message.trim(),
      chatHistory
    );

    // 8. Save Assistant Message & Calculation Snapshot
    const assistantMsgId = `msg_a_${crypto.randomBytes(8).toString("hex")}`;
    const newFollowupCount = session.followupCount + 1;

    await db.insert(messages).values({
      id: assistantMsgId,
      sessionId,
      role: "assistant",
      content: assistantResult.content,
      calculationSnapshot: contextPacket.calculation as unknown as Record<string, unknown>,
      sourcesUsed: contextPacket.dataSources,
    });

    // 9. Update Session state
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
      calculationSnapshot: contextPacket.calculation,
      updatedAction,
      followupCount: newFollowupCount,
      maxFollowupAllowed: session.maxFollowupAllowed,
      isFallback: assistantResult.isFallback,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
