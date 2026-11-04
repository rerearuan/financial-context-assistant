import { describe, it, expect } from "vitest";
import { POST_QUESTIONNAIRE_ITEMS } from "@/lib/survey-questions";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { EXPERIMENT_CELLS } from "@/lib/randomizer";

import { POST as handleCreateSessionPost } from "@/app/api/sessions/route";
import { POST as handleChatPost } from "@/app/api/sessions/[sessionId]/chat/route";
import { POST as handleExperimentPost } from "@/app/api/experiment/route";
import { GET as handleExperimentParticipantGet } from "@/app/api/experiment/[participantId]/route";
import { NextRequest } from "next/server";

function createJsonRequest(url: string, method: string, body?: any): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("E2E Routing & Workflow across all 8 experimental cells", () => {
  for (let cellNum = 1; cellNum <= 8; cellNum++) {
    const cellDef = EXPERIMENT_CELLS.find((c) => c.cellNumber === cellNum)!;

    it(`Cell #${cellNum} (${cellDef.scenarioId} - ${cellDef.condition}): Full route /c/${cellNum} -> Chat -> Step 6 (Tugas) -> Step 7 (Kuesioner) -> Step 8 (Debrief)`, async () => {
      // 1. Participant enters /c/[cellNum] -> calls POST /api/sessions
      const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === cellDef.scenarioId)!;
      expect(pkg).toBeDefined();

      const createSessionReq = createJsonRequest("http://localhost:3000/api/sessions", "POST", {
        cellNumber: cellNum,
      });
      const createSessionRes = await handleCreateSessionPost(createSessionReq);
      expect(createSessionRes.status).toBe(200);
      const sessionData = await createSessionRes.json();

      expect(sessionData.sessionId).toBeDefined();
      expect(sessionData.participantId).toBeDefined();
      expect(sessionData.scenarioId).toBe(cellDef.scenarioId);
      expect(sessionData.condition).toBe(cellDef.condition);

      const { sessionId, participantId } = sessionData;

      // 2. Chatbot interaction with quick reply
      const isSaving = pkg.scenario.actionType === "saving";
      const quickReply = isSaving
        ? "Bagaimana jika bulan ini saya menyisihkan Rp 4.000.000 untuk tabungan Dana Darurat?"
        : "Apa dampaknya terhadap kondisi keuangan saya jika membeli laptop Rp 7 juta secara tunai?";

      // Quick reply validation
      if (isSaving) {
        expect(pkg.scenario.quickReplies![0]).toContain("4.000.000");
        expect(pkg.scenario.quickReplies![0]).not.toContain("2.000.000");
      }

      const chatReq = createJsonRequest(`http://localhost:3000/api/sessions/${sessionId}/chat`, "POST", {
        message: quickReply,
      });
      const chatRes = await handleChatPost(chatReq, { params: Promise.resolve({ sessionId }) });
      expect(chatRes.status).toBe(200);
      const chatData = await chatRes.json();

      expect(chatData.reply).toBeDefined();
      expect(typeof chatData.reply).toBe("string");
      expect(chatData.reply.length).toBeGreaterThan(20);
      expect(chatData.reply).not.toContain("Maaf, terjadi kendala teknis.");

      // 3. Participant clicks "Selesai Diskusi & Lanjut ke Tugas"
      // Chat page triggers ensure_participant_for_session and pushes to /experiment?participantId=...&sessionId=...&step=6
      const ensureReq = createJsonRequest("http://localhost:3000/api/experiment", "POST", {
        action: "ensure_participant_for_session",
        sessionId,
        participantId,
        scenarioId: cellDef.scenarioId,
        condition: cellDef.condition,
      });
      const ensureRes = await handleExperimentPost(ensureReq);
      expect(ensureRes.status).toBe(200);

      // Verify participant step 6 loads correctly
      const loadPartReq = createJsonRequest(`http://localhost:3000/api/experiment/${participantId}`, "GET");
      const loadPartRes = await handleExperimentParticipantGet(loadPartReq, {
        params: Promise.resolve({ participantId }),
      });
      expect(loadPartRes.status).toBe(200);
      const loadPartData = await loadPartRes.json();
      expect(loadPartData.participant).toBeDefined();
      expect(loadPartData.participant.currentStep).toBe(6);
      expect(loadPartData.scenario).toBeDefined();
      expect(loadPartData.scenario.tugasQuestions).toBeDefined();
      expect(loadPartData.scenario.tugasQuestions.length).toBeGreaterThan(0);

      // 4. Participant completes Step 6 (Tugas)
      const finalDecisionReq = createJsonRequest("http://localhost:3000/api/experiment", "POST", {
        action: "final_decision",
        participantId,
        finalDecision: {
          decision: isSaving ? "tetap_menabung" : "membatalkan",
          justification: `Alasan keputusan saya untuk cell #${cellNum} setelah berdiskusi dengan chatbot.`,
          answers: {
            [loadPartData.scenario.tugasQuestions[0].id]: isSaving ? "tetap_menabung" : "membatalkan",
          },
        },
      });
      const finalDecisionRes = await handleExperimentPost(finalDecisionReq);
      expect(finalDecisionRes.status).toBe(200);
      const finalDecisionData = await finalDecisionRes.json();
      expect(finalDecisionData.success).toBe(true);
      expect(finalDecisionData.currentStep).toBe(7);

      // 5. Participant completes Step 7 (Kuesioner 14 items)
      const postAnswers: Record<string, number> = {};
      for (const item of POST_QUESTIONNAIRE_ITEMS) {
        postAnswers[item.code] = 5;
      }

      const questionnaireReq = createJsonRequest("http://localhost:3000/api/experiment", "POST", {
        action: "post_questionnaire",
        participantId,
        postQuestionnaire: postAnswers,
      });
      const questionnaireRes = await handleExperimentPost(questionnaireReq);
      expect(questionnaireRes.status).toBe(200);
      const questionnaireData = await questionnaireRes.json();
      expect(questionnaireData.success).toBe(true);
      expect(questionnaireData.currentStep).toBe(8);

      // 6. Verify final completed state in Step 8
      const finalCheckReq = createJsonRequest(`http://localhost:3000/api/experiment/${participantId}`, "GET");
      const finalCheckRes = await handleExperimentParticipantGet(finalCheckReq, {
        params: Promise.resolve({ participantId }),
      });
      const finalCheckData = await finalCheckRes.json();
      expect(finalCheckData.participant.isCompleted).toBe(true);
      expect(finalCheckData.participant.currentStep).toBe(8);
      expect(finalCheckData.participant.postQuestionnaire).toBeDefined();
      expect(Object.keys(finalCheckData.participant.postQuestionnaire).length).toBe(POST_QUESTIONNAIRE_ITEMS.length);
    }, 45000); // 45s timeout per cell for gemini API response
  }
});
