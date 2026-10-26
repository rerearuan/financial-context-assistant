import { GoogleGenAI } from "@google/genai";
import {
  DEFAULT_GENERATION_PARAMS,
  buildSystemInstruction,
  buildUserPrompt,
  INTENT_EXTRACTION_PROMPT,
  PROMPT_VERSION,
} from "./prompts/templates";
import { ExtractedIntent, ExtractedIntentSchema } from "./prompts/intent-schema";
import { StructuredContextPacket } from "./financial-engine/types";
import { sanitizeAmount } from "./financial-engine/validator";
import {
  validateAssistantOutput,
  OutputValidationResult,
} from "./financial-engine/output-guardrail";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY environment variable is not configured.");
  }
  return key;
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

let genAIClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({ apiKey: getApiKey() });
  }
  return genAIClient;
}

/**
 * Verify if the configured Gemini model is responsive and available.
 */
export async function verifyModelAvailability(): Promise<{
  available: boolean;
  model: string;
  error?: string;
}> {
  const model = getGeminiModel();
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model,
      contents: "Ping. Balas dengan 'OK'.",
    });
    return {
      available: !!response.text,
      model,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      model,
      error: errorMessage,
    };
  }
}

/**
 * Heuristic fallback parser for intent when LLM is unavailable or unparseable.
 */
export function heuristicExtractIntent(
  userMessage: string,
  currentAction: StructuredContextPacket["action"]
): ExtractedIntent {
  const lower = userMessage.toLowerCase();

  let decision: ExtractedIntent["decision"] = null;
  if (lower.includes("lanjut") || lower.includes("setuju") || lower.includes("eksekusi")) {
    decision = "proceed";
  } else if (lower.includes("tunda") || lower.includes("nanti saja")) {
    decision = "postpone";
  } else if (lower.includes("batal") || lower.includes("tidak jadi")) {
    decision = "cancel";
  } else if (lower.includes("ubah") || lower.includes("ganti nominal") || lower.includes("sesuaikan")) {
    decision = "modify";
  }

  // Look for new amount
  let newAmount: number | null = null;
  const nominalMatch = userMessage.match(/(?:rp\.?\s*|\b)(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb|k|\.000)/i);
  if (nominalMatch) {
    newAmount = sanitizeAmount(nominalMatch[0]);
  } else {
    // Look for raw numbers > 1000
    const rawNumMatch = userMessage.match(/\b\d{4,9}\b/);
    if (rawNumMatch) {
      newAmount = sanitizeAmount(rawNumMatch[0]);
    }
  }

  // Look for user provided finances (e.g. "saldo saya 10 juta", "anggaran 2 jt", "dana darurat 5 juta")
  const balanceMatch = userMessage.match(/saldo(?:[^0-9]{0,30})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k)?)/i);
  const budgetMatch = userMessage.match(/anggaran(?:[^0-9]{0,30})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k)?)/i);
  const liabilitiesMatch = userMessage.match(/(?:tanggungan|kewajiban|tagihan|utang|cicilan)(?:[^0-9]{0,30})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k)?)/i);
  const bufferMatch = userMessage.match(/(?:dana darurat|buffer)(?:[^0-9]{0,30})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k)?)/i);

  let userProvidedFinances: ExtractedIntent["userProvidedFinances"] = null;
  if (balanceMatch || budgetMatch || liabilitiesMatch || bufferMatch) {
    userProvidedFinances = {
      balance: balanceMatch ? sanitizeAmount(balanceMatch[1]) || undefined : undefined,
      budget: budgetMatch ? sanitizeAmount(budgetMatch[1]) || undefined : undefined,
      liabilities: liabilitiesMatch ? sanitizeAmount(liabilitiesMatch[1]) || undefined : undefined,
      buffer: bufferMatch ? sanitizeAmount(bufferMatch[1]) || undefined : undefined,
    };

    // If newAmount merely picked up the user's balance/budget/liabilities/buffer figure,
    // do not treat it as an action modification unless explicit modification keywords are present
    const hasModifyKeyword = /(ganti|ubah|harga|beli|jadinya|nominal|kalau)\b/i.test(userMessage);
    if (!hasModifyKeyword && newAmount) {
      if (
        newAmount === userProvidedFinances.balance ||
        newAmount === userProvidedFinances.budget ||
        newAmount === userProvidedFinances.liabilities ||
        newAmount === userProvidedFinances.buffer
      ) {
        newAmount = null;
      }
    }
  }

  let intentType: ExtractedIntent["intentType"] = "inquire";
  if (decision) {
    intentType = "final_decision";
  } else if (newAmount && newAmount !== currentAction.amount) {
    intentType = "modify_action";
  } else if (userProvidedFinances) {
    intentType = "clarify_info";
  }

  return {
    intentType,
    newAmount,
    newTiming: null,
    userProvidedFinances,
    decision,
    summaryOfIntent: `Ekstraksi heuristik: ${intentType}`,
  };
}

/**
 * 1. Extract intent & action modifications using structured extraction with schema validation.
 */
export async function extractIntent(
  userMessage: string,
  currentAction: StructuredContextPacket["action"]
): Promise<ExtractedIntent> {
  try {
    const ai = getGeminiClient();
    const model = getGeminiModel();

    const promptText = `${INTENT_EXTRACTION_PROMPT.replace(
      "{{CURRENT_ACTION}}",
      `${currentAction.type} sebesar Rp ${currentAction.amount.toLocaleString("id-ID")} untuk ${currentAction.targetCategory}`
    )}\n\nPesan pengguna:\n"${userMessage}"`;

    const response = await ai.models.generateContent({
      model,
      contents: promptText,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "{}";
    const cleanedText = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleanedText);

    // Validate with Zod
    const validated = ExtractedIntentSchema.safeParse(parsed);
    if (validated.success) {
      if (validated.data.newAmount) {
        validated.data.newAmount = sanitizeAmount(validated.data.newAmount);
      }
      return validated.data;
    }
  } catch {
    // If Gemini fails or throws, gracefully fallback to deterministic regex heuristic
  }

  return heuristicExtractIntent(userMessage, currentAction);
}

/**
 * Generates a safe deterministic fallback response if Gemini is unavailable or fails guardrails.
 */
export function generateSafeFallbackResponse(
  contextPacket: StructuredContextPacket,
  userMessage?: string
): string {
  const { condition, action, calculation } = contextPacket;

  if (condition === "basic" && calculation.status === "needs_clarification") {
    return (
      `Anda sedang mempertimbangkan rencana ${action.type === "spending" ? "pengeluaran" : "penyisihan dana"} sebesar ` +
      `Rp ${action.amount.toLocaleString("id-ID")} untuk ${action.targetCategory} pada ${action.timing}.\n\n` +
      `Karena informasi saldo kas operasional atau alokasi anggaran Anda belum tercatat dalam sesi ini, ` +
      `saya belum dapat melakukan perhitungan numerik spesifik. ` +
      `Jika Anda ingin evaluasi perhitungan saldo atau kesiapan anggaran, silakan bagikan perkiraan saldo atau anggaran Anda saat ini.`
    );
  }

  // For Context-Aware or Basic with user-provided data
  let response =
    `Berdasarkan perhitungan terhadap rencana ${action.type === "spending" ? "pengeluaran" : "penyisihan dana"} ` +
    `sebesar Rp ${action.amount.toLocaleString("id-ID")}:\n\n`;

  if (calculation.balanceAfterAction !== null) {
    response += `• Sisa saldo kas setelah tindakan diperkirakan menjadi Rp ${calculation.balanceAfterAction.toLocaleString("id-ID")}.\n`;
  }

  if (calculation.relevantBudget) {
    if (calculation.isBudgetExceeded) {
      response += `• Rencana ini melebihi sisa pos anggaran ${calculation.relevantBudget.category} sebesar Rp ${Math.abs(
        calculation.budgetVariance || 0
      ).toLocaleString("id-ID")}.\n`;
    } else {
      response += `• Rencana ini masih dalam batas pos anggaran ${calculation.relevantBudget.category} (tersisa Rp ${(
        calculation.budgetVariance || 0
      ).toLocaleString("id-ID")}).\n`;
    }
  }

  if (calculation.liabilitiesDueBeforeIncome.length > 0) {
    response += `• Terdapat kewajiban pembayaran mendesak sebelum pemasukan berikutnya sebesar total Rp ${calculation.totalLiabilitiesBeforeIncome.toLocaleString(
      "id-ID"
    )}.\n`;
  }

  if (calculation.remainingCashAfterImmediateObligations !== null) {
    if (calculation.isLiquidityThreatened) {
      response += `• Sisa kas operasional: Mengalami defisit sebesar Rp ${calculation.deficitAmount.toLocaleString(
        "id-ID"
      )} untuk memenuhi kewajiban terdekat.\n`;
    } else {
      response += `• Sisa kas operasional setelah kewajiban terdekat: Tersisa Rp ${calculation.remainingCashAfterImmediateObligations.toLocaleString(
        "id-ID"
      )}.\n`;
    }
  }

  if (calculation.bufferImpact.minBuffer !== null && calculation.bufferImpact.minBuffer > 0) {
    if (!calculation.isBufferMaintained) {
      response += `• Batas buffer dana darurat: Berada di bawah batas minimum (minimal Rp ${calculation.bufferImpact.minBuffer.toLocaleString(
        "id-ID"
      )}), dengan kekurangan buffer sebesar Rp ${calculation.bufferImpact.bufferShortfall.toLocaleString(
        "id-ID"
      )}.\n`;
    } else {
      response += `• Batas buffer dana darurat: Tetap terlindungi (minimal Rp ${calculation.bufferImpact.minBuffer.toLocaleString(
        "id-ID"
      )}).\n`;
    }
  }

  if (calculation.goalsEvaluation.length > 0) {
    for (const ge of calculation.goalsEvaluation) {
      response += `• Pos tujuan ${ge.title}: ${ge.explanation}\n`;
    }
  }

  response += `• Cakupan kebutuhan harian: Kecukupan untuk kebutuhan harian belum dapat dipastikan karena nominal kebutuhan harian belum tercatat.\n`;

  response += `\nSilakan sampaikan tanggapan atau pertanyaan lebih lanjut terkait pertimbangan ini.`;
  return response;
}

export interface AssistantResponseResult {
  content: string;
  modelUsed: string;
  promptVersion: string;
  isFallback: boolean;
  retryCount: number;
  validationResult?: OutputValidationResult;
}

/**
 * 3. Generate assistant explanation using Gemini with strict facts grounding,
 * output guardrails, and automated retry harness.
 */
export async function generateAssistantResponse(
  contextPacket: StructuredContextPacket,
  userMessage: string,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<AssistantResponseResult> {
  const model = getGeminiModel();
  const systemInstruction = buildSystemInstruction(contextPacket.condition);

  // Format short recent chat history summary (max last 4 messages)
  const recentHistory = chatHistory.slice(-4);
  const historySummary = recentHistory
    .map((m) => `${m.role === "user" ? "Pengguna" : "Asisten"}: ${m.content}`)
    .join("\n\n");

  const baseUserPrompt = buildUserPrompt(contextPacket, userMessage, historySummary);

  let retryCount = 0;
  let lastValidationResult: OutputValidationResult | undefined;

  try {
    const ai = getGeminiClient();

    // First attempt
    const response = await ai.models.generateContent({
      model,
      contents: baseUserPrompt,
      config: {
        systemInstruction,
        temperature: DEFAULT_GENERATION_PARAMS.temperature,
        topP: DEFAULT_GENERATION_PARAMS.topP,
        maxOutputTokens: DEFAULT_GENERATION_PARAMS.maxOutputTokens,
      },
    });

    const reply = response.text?.trim();

    if (reply && reply.length >= 20) {
      // Run Output Guardrail
      const guardrailResult = validateAssistantOutput(reply, contextPacket);
      if (guardrailResult.isValid) {
        return {
          content: reply,
          modelUsed: model,
          promptVersion: PROMPT_VERSION,
          isFallback: false,
          retryCount: 0,
          validationResult: guardrailResult,
        };
      }

      // If guardrail failed, log violations and attempt 1 corrective retry
      lastValidationResult = guardrailResult;
      retryCount = 1;

      const correctivePrompt = `${baseUserPrompt}

<instruksi_koreksi_guardrail>
PERHATIAN: Draf jawaban sebelumnya melanggar aturan guardrail sistem berikut:
${guardrailResult.violations.map((v) => `- ${v}`).join("\n")}

Harap susun ulang respons dengan mematuhi <kontrak_respons> dan <fakta_perhitungan_terverifikasi> secara ketat. Perbaiki semua pelanggaran di atas.
</instruksi_koreksi_guardrail>`;

      const retryResponse = await ai.models.generateContent({
        model,
        contents: correctivePrompt,
        config: {
          systemInstruction,
          temperature: 0.05, // Lower temperature on retry
          topP: DEFAULT_GENERATION_PARAMS.topP,
          maxOutputTokens: DEFAULT_GENERATION_PARAMS.maxOutputTokens,
        },
      });

      const retryReply = retryResponse.text?.trim();
      if (retryReply && retryReply.length >= 20) {
        const retryGuardrail = validateAssistantOutput(retryReply, contextPacket);
        if (retryGuardrail.isValid) {
          return {
            content: retryReply,
            modelUsed: model,
            promptVersion: PROMPT_VERSION,
            isFallback: false,
            retryCount: 1,
            validationResult: retryGuardrail,
          };
        }
        lastValidationResult = retryGuardrail;
      }
    }
  } catch (err: unknown) {
    console.warn("Gemini generation call failed, executing fallback:", err);
  }

  // If both generation/retry attempts fail or violate guardrails, activate safe deterministic fallback
  const fallbackText = generateSafeFallbackResponse(contextPacket, userMessage);
  return {
    content: fallbackText,
    modelUsed: model,
    promptVersion: PROMPT_VERSION,
    isFallback: true,
    retryCount,
    validationResult: lastValidationResult,
  };
}
