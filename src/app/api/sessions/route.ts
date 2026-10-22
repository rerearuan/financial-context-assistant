import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, scenarios, messages } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { getGeminiModel } from "@/lib/gemini";
import { PROMPT_VERSION } from "@/lib/prompts/templates";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scenarioId, condition, participantCode } = body;

    if (!scenarioId || !condition) {
      return NextResponse.json(
        { error: "scenarioId dan condition wajib diisi." },
        { status: 400 }
      );
    }

    if (condition !== "basic" && condition !== "context_aware") {
      return NextResponse.json(
        { error: "condition harus bernilai 'basic' atau 'context_aware'." },
        { status: 400 }
      );
    }

    // Verify scenario exists
    const [scenario] = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.id, scenarioId));

    if (!scenario) {
      return NextResponse.json(
        { error: `Skenario '${scenarioId}' tidak ditemukan.` },
        { status: 404 }
      );
    }

    // Generate secure random unguessable session ID
    const sessionId = `ses_${crypto.randomBytes(16).toString("hex")}`;
    const code =
      participantCode || `P-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const modelId = getGeminiModel();

    const maxFollowup = parseInt(process.env.MAX_FOLLOWUP_QUESTIONS || "2", 10);

    // Insert session
    await db.insert(sessions).values({
      id: sessionId,
      participantCode: code,
      scenarioId,
      condition,
      currentAction: scenario.initialAction,
      status: "in_progress",
      followupCount: 0,
      maxFollowupAllowed: maxFollowup,
      promptVersion: PROMPT_VERSION,
      modelId,
    });

    // Insert initial assistant message
    const initialMsgId = `msg_${crypto.randomBytes(12).toString("hex")}`;
    await db.insert(messages).values({
      id: initialMsgId,
      sessionId,
      role: "assistant",
      content: scenario.initialAssistantMessage,
      sourcesUsed:
        condition === "context_aware"
          ? ["scenario", "synthetic_profile"]
          : ["scenario"],
    });

    return NextResponse.json({
      sessionId,
      participantCode: code,
      scenarioId,
      condition,
      currentAction: scenario.initialAction,
      initialMessage: {
        id: initialMsgId,
        role: "assistant",
        content: scenario.initialAssistantMessage,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
