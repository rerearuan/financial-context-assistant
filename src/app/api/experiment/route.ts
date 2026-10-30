import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { participants, sessions, scenarios, messages } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { assignBalancedCell } from "@/lib/randomizer";
import { getGeminiModel } from "@/lib/gemini";
import { PROMPT_VERSION } from "@/lib/prompts/templates";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import {
  demoParticipants,
  demoSessions,
  demoMessages,
  DemoParticipant,
  DemoSession,
} from "@/lib/demo-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // 1. START: Initialize new participant
    if (action === "start") {
      const participantId = `part_${crypto.randomBytes(12).toString("hex")}`;
      const code = `RESP-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

      try {
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
      } catch (dbErr) {
        console.warn("DB not reachable in /api/experiment (start), using demo memory:", dbErr);
        const demoPart: DemoParticipant = {
          id: participantId,
          participantCode: code,
          consent: false,
          currentStep: 1,
          isCompleted: false,
          disqualified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        demoParticipants.set(participantId, demoPart);
        return NextResponse.json({ participant: demoPart, isDemoMode: true });
      }
    }

    // 2. CONSENT
    if (action === "consent") {
      const { participantId, consent } = body;
      if (!participantId) {
        return NextResponse.json({ error: "participantId diperlukan" }, { status: 400 });
      }

      if (!consent) {
        try {
          await db
            .update(participants)
            .set({
              consent: false,
              disqualified: true,
              disqualifiedReason: "Responden tidak bersedia memberikan persetujuan penelitian.",
              updatedAt: new Date(),
            })
            .where(eq(participants.id, participantId));
        } catch {
          const part = demoParticipants.get(participantId);
          if (part) {
            part.consent = false;
            part.disqualified = true;
            part.disqualifiedReason = "Responden tidak bersedia memberikan persetujuan penelitian.";
          }
        }

        return NextResponse.json({
          disqualified: true,
          message: "Terima kasih atas waktu Anda. Anda telah memilih untuk tidak berpartisipasi.",
        });
      }

      try {
        await db
          .update(participants)
          .set({
            consent: true,
            currentStep: 2,
            updatedAt: new Date(),
          })
          .where(eq(participants.id, participantId));
      } catch {
        const part = demoParticipants.get(participantId);
        if (part) {
          part.consent = true;
          part.currentStep = 2;
        }
      }

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
        try {
          await db
            .update(participants)
            .set({
              demographics,
              disqualified: true,
              disqualifiedReason: "Responden tidak memenuhi kriteria pendapatan pribadi (Screening Out).",
              updatedAt: new Date(),
            })
            .where(eq(participants.id, participantId));
        } catch {
          const part = demoParticipants.get(participantId);
          if (part) {
            part.demographics = demographics;
            part.disqualified = true;
            part.disqualifiedReason = "Responden tidak memenuhi kriteria pendapatan pribadi (Screening Out).";
          }
        }

        return NextResponse.json({
          disqualified: true,
          message:
            "Terima kasih atas partisipasi Anda. Penelitian ini ditujukan kepada individu yang memiliki pendapatan pribadi. Sesi survei Anda telah selesai.",
        });
      }

      // Backend Balanced Randomization across 8 cells (25 x 8 = 200 total)
      const assignment = await assignBalancedCell();
      const { cellNumber, scenarioId, condition } = assignment;

      // Find scenario definition
      const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === scenarioId);
      const scenarioFallback = pkg?.scenario;

      const sessionId = `ses_${crypto.randomBytes(16).toString("hex")}`;
      const modelId = getGeminiModel();
      const maxFollowup = parseInt(process.env.MAX_FOLLOWUP_QUESTIONS || "4", 10);

      try {
        let [scenario] = await db
          .select()
          .from(scenarios)
          .where(eq(scenarios.id, scenarioId));

        if (!scenario && scenarioFallback) {
          scenario = scenarioFallback as any;
        }

        const [part] = await db
          .select()
          .from(participants)
          .where(eq(participants.id, participantId));

        const partCode = part?.participantCode || `RESP-${participantId.slice(-4).toUpperCase()}`;

        // Create session in database
        await db.insert(sessions).values({
          id: sessionId,
          participantCode: partCode,
          scenarioId,
          condition,
          currentAction: scenario.initialAction,
          status: "in_progress",
          followupCount: 0,
          maxFollowupAllowed: maxFollowup,
          promptVersion: PROMPT_VERSION,
          modelId,
        });

        // Chat starts from the user, no initial assistant message is pre-inserted

        // Update participant with cell assignment & session link
        await db
          .update(participants)
          .set({
            demographics,
            cellNumber,
            scenarioId,
            condition,
            sessionId,
            currentStep: 3,
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
            situasiText: scenarioFallback?.situasiText || scenario.situasiText,
            kondisiKeuanganText: scenarioFallback?.kondisiKeuanganText || scenario.kondisiKeuanganText,
            tugasText: scenarioFallback?.tugasText || scenario.tugasText,
            descriptionText: scenarioFallback?.descriptionText || scenario.descriptionText,
            tugasQuestions: scenarioFallback?.tugasQuestions || scenario.tugasQuestions,
            comprehensionQuestions: scenario.comprehensionQuestions || scenarioFallback?.comprehensionQuestions || [],
          },
        });
      } catch (dbErr) {
        console.warn("DB not reachable in demographics, using demo memory:", dbErr);
        if (!scenarioFallback) {
          return NextResponse.json({ error: "Skenario tidak ditemukan" }, { status: 500 });
        }

        const part = demoParticipants.get(participantId);
        const partCode = part?.participantCode || `RESP-${participantId.slice(-4).toUpperCase()}`;

        // Save session in demoSessions
        const demoSess: DemoSession = {
          id: sessionId,
          participantCode: partCode,
          scenarioId,
          condition,
          currentAction: scenarioFallback.initialAction as unknown as Record<string, unknown>,
          status: "in_progress",
          followupCount: 0,
          maxFollowupAllowed: maxFollowup,
          promptVersion: PROMPT_VERSION,
          modelId,
        };
        demoSessions.set(sessionId, demoSess);

        // Start chat with empty message list so user sends the first message
        demoMessages.set(sessionId, []);

        // Update demo participant
        if (part) {
          part.demographics = demographics;
          part.cellNumber = cellNumber;
          part.scenarioId = scenarioId;
          part.condition = condition;
          part.sessionId = sessionId;
          part.currentStep = 3;
        }

        return NextResponse.json({
          success: true,
          isDemoMode: true,
          currentStep: 3,
          cellNumber,
          scenarioId,
          condition,
          sessionId,
          scenario: {
            id: scenarioFallback.id,
            code: scenarioFallback.code,
            title: scenarioFallback.title,
            actionType: scenarioFallback.actionType,
            situasiText: scenarioFallback.situasiText,
            kondisiKeuanganText: scenarioFallback.kondisiKeuanganText,
            tugasText: scenarioFallback.tugasText,
            descriptionText: scenarioFallback.descriptionText,
            tugasQuestions: scenarioFallback.tugasQuestions,
            comprehensionQuestions: scenarioFallback.comprehensionQuestions,
          },
        });
      }
    }

    // 4. EARLY DECISION (Step 4 Comprehension Check / Early Decision)
    if (action === "early_decision") {
      const { participantId, earlyDecision } = body;
      if (!participantId || !earlyDecision) {
        return NextResponse.json({ error: "Data keputusan awal diperlukan" }, { status: 400 });
      }

      try {
        await db
          .update(participants)
          .set({
            earlyDecision,
            currentStep: 5,
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
          sessionId: part?.sessionId,
        });
      } catch {
        const part = demoParticipants.get(participantId);
        if (part) {
          part.earlyDecision = earlyDecision;
          part.currentStep = 5;
        }

        return NextResponse.json({
          success: true,
          currentStep: 5,
          sessionId: part?.sessionId,
        });
      }
    }

    // 5. FINAL DECISION (Step 6 after Chatbot)
    if (action === "final_decision") {
      const { participantId, finalDecision } = body;
      if (!participantId || !finalDecision) {
        return NextResponse.json({ error: "Data keputusan akhir diperlukan" }, { status: 400 });
      }

      try {
        await db
          .update(participants)
          .set({
            finalDecision,
            currentStep: 7,
            updatedAt: new Date(),
          })
          .where(eq(participants.id, participantId));
      } catch {
        const part = demoParticipants.get(participantId);
        if (part) {
          part.finalDecision = finalDecision;
          part.currentStep = 7;
        }
      }

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

      try {
        await db
          .update(participants)
          .set({
            postQuestionnaire,
            currentStep: 8,
            isCompleted: true,
            updatedAt: new Date(),
          })
          .where(eq(participants.id, participantId));
      } catch {
        const part = demoParticipants.get(participantId);
        if (part) {
          part.postQuestionnaire = postQuestionnaire;
          part.currentStep = 8;
          part.isCompleted = true;
        }
      }

      return NextResponse.json({
        success: true,
        currentStep: 8,
      });
    }

    return NextResponse.json({ error: "Action tidak dikenal" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Experiment API error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
