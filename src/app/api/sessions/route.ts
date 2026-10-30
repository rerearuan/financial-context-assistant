import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, scenarios, messages } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { getGeminiModel } from "@/lib/gemini";
import { PROMPT_VERSION } from "@/lib/prompts/templates";
import { EXPERIMENT_CELLS } from "@/lib/randomizer";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { demoSessions, demoMessages, DemoSession, DemoMessage } from "@/lib/demo-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { scenarioId, condition, participantCode, cellNumber } = body;

    // 1. If cellNumber (1-8) is provided directly (e.g. from /c/[cell] or form link)
    if (cellNumber !== undefined && cellNumber !== null) {
      const cellNum = Number(cellNumber);
      if (isNaN(cellNum) || cellNum < 1 || cellNum > 8) {
        return NextResponse.json(
          { error: "cellNumber harus bernilai angka antara 1 sampai 8." },
          { status: 400 }
        );
      }

      const matchedCell = EXPERIMENT_CELLS.find((c) => c.cellNumber === cellNum);
      if (!matchedCell) {
        return NextResponse.json(
          { error: `Kombinasi cell #${cellNum} tidak ditemukan.` },
          { status: 404 }
        );
      }

      scenarioId = matchedCell.scenarioId;
      condition = matchedCell.condition;

      if (!participantCode) {
        participantCode = `PART-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      }
    }

    if (!scenarioId || !condition) {
      return NextResponse.json(
        { error: "scenarioId dan condition atau cellNumber wajib diisi." },
        { status: 400 }
      );
    }

    if (condition !== "basic" && condition !== "context_aware") {
      return NextResponse.json(
        { error: "condition harus bernilai 'basic' atau 'context_aware'." },
        { status: 400 }
      );
    }

    // 2. Find scenario definition from database or fallback fixture
    const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === scenarioId);
    let scenario: any = null;

    try {
      const [dbScenario] = await db
        .select()
        .from(scenarios)
        .where(eq(scenarios.id, scenarioId));
      if (dbScenario) {
        scenario = dbScenario;
      }
    } catch (dbErr) {
      console.warn("DB lookup error, falling back to static fixtures:", dbErr);
    }

    if (!scenario && pkg) {
      scenario = pkg.scenario;
    }

    if (!scenario) {
      return NextResponse.json(
        { error: `Skenario '${scenarioId}' tidak ditemukan.` },
        { status: 404 }
      );
    }

    // 3. Generate secure unguessable session ID
    const sessionId = `ses_${crypto.randomBytes(16).toString("hex")}`;
    const code =
      participantCode || `P-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const modelId = getGeminiModel();
    const maxFollowup = parseInt(process.env.MAX_FOLLOWUP_QUESTIONS || "4", 10);

    const initialMsgId = `msg_${crypto.randomBytes(12).toString("hex")}`;
    const initialContent =
      scenario.initialAssistantMessage ||
      "Halo! Saya asisten finansial Anda. Ada yang bisa saya bantu terkait keputusan keuangan Anda?";
    const sourcesUsed =
      condition === "context_aware"
        ? ["scenario", "synthetic_profile"]
        : ["scenario"];

    // 4. Try to save session in database
    try {
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

      await db.insert(messages).values({
        id: initialMsgId,
        sessionId,
        role: "assistant",
        content: initialContent,
        sourcesUsed,
      });
    } catch (dbInsertErr) {
      console.warn("DB insert error, session will be saved in demo-store:", dbInsertErr);
    }

    // 5. Always persist in in-memory demo-store as guaranteed fallback
    const demoSess: DemoSession = {
      id: sessionId,
      participantCode: code,
      scenarioId,
      condition,
      currentAction: scenario.initialAction as unknown as Record<string, unknown>,
      status: "in_progress",
      followupCount: 0,
      maxFollowupAllowed: maxFollowup,
      promptVersion: PROMPT_VERSION,
      modelId,
    };
    demoSessions.set(sessionId, demoSess);

    const demoMsg: DemoMessage = {
      id: initialMsgId,
      sessionId,
      role: "assistant",
      content: initialContent,
      createdAt: new Date(),
      sourcesUsed,
    };
    demoMessages.set(sessionId, [demoMsg]);

    return NextResponse.json({
      sessionId,
      participantCode: code,
      scenarioId,
      condition,
      cellNumber: cellNumber ? Number(cellNumber) : undefined,
      currentAction: scenario.initialAction,
      initialMessage: {
        id: initialMsgId,
        role: "assistant",
        content: initialContent,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
