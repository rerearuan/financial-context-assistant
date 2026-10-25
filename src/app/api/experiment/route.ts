import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { participants, sessions, scenarios, messages } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { assignBalancedCell } from "@/lib/randomizer";
import { getGeminiModel } from "@/lib/gemini";
import { PROMPT_VERSION } from "@/lib/prompts/templates";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // 1. START: Initialize new participant
    if (action === "start") {
      const participantId = `part_${crypto.randomBytes(12).toString("hex")}`;
      const code = `RESP-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

      await db.insert(participants).values({
        id: participantId,
        participantCode: code,
        consent: false,
        currentStep: 1,
        isCompleted: false,
        disqualified: false,
      });

      const [newParticipant] = await db
        .select()
        .from(participants)
        .where(eq(participants.id, participantId));

      return NextResponse.json({ participant: newParticipant });
    }

    // 2. CONSENT
    if (action === "consent") {
      const { participantId, consent } = body;
      if (!participantId) {
        return NextResponse.json({ error: "participantId diperlukan" }, { status: 400 });
      }

      if (!consent) {
        await db
          .update(participants)
          .set({
            consent: false,
            disqualified: true,
            disqualifiedReason: "Responden tidak bersedia memberikan persetujuan penelitian.",
            updatedAt: new Date(),
          })
          .where(eq(participants.id, participantId));

        return NextResponse.json({
          disqualified: true,
          message: "Terima kasih atas waktu Anda. Anda telah memilih untuk tidak berpartisipasi.",
        });
      }

      await db
        .update(participants)
        .set({
          consent: true,
          currentStep: 2,
          updatedAt: new Date(),
        })
        .where(eq(participants.id, participantId));

      return NextResponse.json({ success: true, currentStep: 2 });
    }

    // 3. DEMOGRAPHICS & BALANCED CELL RANDOMIZATION
    if (action === "demographics") {
      const { participantId, demographics } = body;
      if (!participantId || !demographics) {
        return NextResponse.json({ error: "Data demografi diperlukan" }, { status: 400 });
      }

      // Screening rule from PDF: harus memiliki pendapatan pribadi
      if (demographics.monthlyIncome === "Tidak memiliki pendapatan") {
        await db
          .update(participants)
          .set({
            demographics,
            disqualified: true,
            disqualifiedReason: "Responden tidak memenuhi kriteria pendapatan pribadi (Screening Out).",
            updatedAt: new Date(),
          })
          .where(eq(participants.id, participantId));

        return NextResponse.json({
          disqualified: true,
          message:
            "Terima kasih atas partisipasi Anda. Penelitian ini ditujukan kepada individu yang memiliki pendapatan pribadi. Sesi survei Anda telah selesai.",
        });
      }

      // Backend Balanced Randomization across 8 cells (25 x 8 = 200 total)
      const assignment = await assignBalancedCell();
      const { cellNumber, scenarioId, condition } = assignment;

      // Fetch scenario
      const [scenario] = await db
        .select()
        .from(scenarios)
        .where(eq(scenarios.id, scenarioId));

      if (!scenario) {
        return NextResponse.json({ error: "Skenario tidak ditemukan" }, { status: 500 });
      }

      // Generate a dedicated session for this participant
      const sessionId = `ses_${crypto.randomBytes(16).toString("hex")}`;
      const [part] = await db
        .select()
        .from(participants)
        .where(eq(participants.id, participantId));

      const modelId = getGeminiModel();
      const maxFollowup = parseInt(process.env.MAX_FOLLOWUP_QUESTIONS || "2", 10);

      // Create session in database
      await db.insert(sessions).values({
        id: sessionId,
        participantCode: part.participantCode,
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

      // Update participant with cell assignment & session link
      await db
        .update(participants)
        .set({
          demographics,
          cellNumber,
          scenarioId,
          condition,
          sessionId,
          currentStep: 3, // Advances to Step 3 (Skenario & Profile)
          updatedAt: new Date(),
        })
        .where(eq(participants.id, participantId));

      return NextResponse.json({
        success: true,
        currentStep: 3,
        cellNumber,
        scenarioId,
        condition,
        sessionId,
        scenario: {
          id: scenario.id,
          code: scenario.code,
          title: scenario.title,
          actionType: scenario.actionType,
          situasiText: scenario.situasiText,
          kondisiKeuanganText: scenario.kondisiKeuanganText,
          tugasText: scenario.tugasText,
          descriptionText: scenario.descriptionText,
          tugasQuestions: scenario.tugasQuestions,
        },
      });
    }

    // 4. EARLY DECISION (Step 4 Comprehension Check / Early Decision)
    if (action === "early_decision") {
      const { participantId, earlyDecision } = body;
      if (!participantId || !earlyDecision) {
        return NextResponse.json({ error: "Data keputusan awal diperlukan" }, { status: 400 });
      }

      await db
        .update(participants)
        .set({
          earlyDecision,
          currentStep: 5, // Advances to Step 5 (Chatbot)
          updatedAt: new Date(),
        })
        .where(eq(participants.id, participantId));

      const [part] = await db
        .select()
        .from(participants)
        .where(eq(participants.id, participantId));

      return NextResponse.json({
        success: true,
        currentStep: 5,
        sessionId: part.sessionId,
      });
    }

    // 5. FINAL DECISION (Step 6 after Chatbot)
    if (action === "final_decision") {
      const { participantId, finalDecision } = body;
      if (!participantId || !finalDecision) {
        return NextResponse.json({ error: "Data keputusan akhir diperlukan" }, { status: 400 });
      }

      await db
        .update(participants)
        .set({
          finalDecision,
          currentStep: 7, // Advances to Step 7 (Post-Questionnaire)
          updatedAt: new Date(),
        })
        .where(eq(participants.id, participantId));

      return NextResponse.json({
        success: true,
        currentStep: 7,
      });
    }

    // 6. POST QUESTIONNAIRE (Step 7 AT, MAC, RMAS, OCC, PFDA)
    if (action === "post_questionnaire") {
      const { participantId, postQuestionnaire } = body;
      if (!participantId || !postQuestionnaire) {
        return NextResponse.json({ error: "Data kuesioner akhir diperlukan" }, { status: 400 });
      }

      await db
        .update(participants)
        .set({
          postQuestionnaire,
          currentStep: 8, // Advances to Step 8 (Debriefing / Penutup)
          isCompleted: true,
          updatedAt: new Date(),
        })
        .where(eq(participants.id, participantId));

      return NextResponse.json({
        success: true,
        currentStep: 8,
      });
    }

    return NextResponse.json({ error: "Action tidak dikenal" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
