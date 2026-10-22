import { GoogleGenAI } from "@google/genai";
import {
  DEFAULT_GENERATION_PARAMS,
  buildSystemInstruction,
  buildUserPrompt,
  INTENT_EXTRACTION_PROMPT,
} from "./prompts/templates";
import { ExtractedIntent, ExtractedIntentSchema } from "./prompts/intent-schema";
import { StructuredContextPacket } from "./financial-engine/types";
import { sanitizeAmount } from "./financial-engine/validator";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY environment variable is not configured.");
  }
  return key;
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
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
function heuristicExtractIntent(
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
  } else if (lower.includes("ubah") || lower.includes("ganti nominal")) {
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

  // Look for user provided finances (e.g. "saldo saya 10 juta", "anggaran 2 jt")
  const balanceMatch = userMessage.match(/saldo(?:[\w\s]{0,15})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k)?)/i);
  const budgetMatch = userMessage.match(/anggaran(?:[\w\s]{0,15})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k)?)/i);

  let userProvidedFinances: ExtractedIntent["userProvidedFinances"] = null;
  if (balanceMatch || budgetMatch) {
    userProvidedFinances = {
      balance: balanceMatch ? sanitizeAmount(balanceMatch[1]) || undefined : undefined,
      budget: budgetMatch ? sanitizeAmount(budgetMatch[1]) || undefined : undefined,
    };
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
 * 1. Extract intent & action modifications using structured extraction.
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
      // Clean and sanitize newAmount if present
      if (validated.data.newAmount) {
        validated.data.newAmount = sanitizeAmount(validated.data.newAmount);
      }
      return validated.data;
    }
  } catch {
    // If Gemini fails, gracefully fallback to deterministic regex heuristic
  }

  return heuristicExtractIntent(userMessage, currentAction);
}

/**
 * Generates a safe deterministic fallback response if Gemini is unavailable or fails validation.
 */
export function generateSafeFallbackResponse(
  contextPacket: StructuredContextPacket,
  userMessage: string
): string {
  const { condition, action, calculation } = contextPacket;

  if (condition === "basic" && calculation.status === "needs_clarification") {
    return (
      `Anda sedang mempertimbangkan ${action.type === "spending" ? "pengeluaran" : "penyisihan dana"} sebesar ` +
      `Rp ${action.amount.toLocaleString("id-ID")} untuk ${action.targetCategory} pada ${action.timing}.\n\n` +
      `Karena saya belum memiliki data saldo kas operasional atau anggaran Anda dalam sesi ini, ` +
      `saya belum dapat menghitung sisa dana atau dampak langsungnya secara numerik. ` +
      `Jika Anda ingin evaluasi yang lebih spesifik, silakan bagikan perkiraan saldo atau anggaran yang Anda miliki saat ini.`
    );
  }

  // For Context-Aware or Basic with user-provided data
  let response =
    `Berdasarkan perhitungan terhadap rencana ${action.type === "spending" ? "pengeluaran" : "penyisihan dana"} ` +
    `sebesar Rp ${action.amount.toLocaleString("id-ID")}:\n\n`;

  if (calculation.balanceAfterAction !== null) {
    response += `• Saldo kas setelah tindakan menjadi Rp ${calculation.balanceAfterAction.toLocaleString("id-ID")}.\n`;
  }

  if (calculation.relevantBudget) {
    if (calculation.isBudgetExceeded) {
      response += `• Rencana ini melebihi sisa anggaran pos ${calculation.relevantBudget.category} sebesar Rp ${Math.abs(
        calculation.budgetVariance || 0
      ).toLocaleString("id-ID")}.\n`;
    } else {
      response += `• Rencana ini masih dalam batas anggaran pos ${calculation.relevantBudget.category} (tersisa Rp ${(
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
      response += `• PERHATIAN: Sisa kas likuid mengalami potensi defisit sebesar Rp ${calculation.deficitAmount.toLocaleString(
        "id-ID"
      )} untuk memenuhi kewajiban terdekat.\n`;
    } else {
      response += `• Sisa kas likuid setelah kewajiban terdekat diperkirakan aman sebesar Rp ${calculation.remainingCashAfterImmediateObligations.toLocaleString(
        "id-ID"
      )}.\n`;
    }
  }

  response += `\nAnda dapat memilih untuk melanjutkan simulasi ("Lanjut"), menyesuaikan nominal ("Ubah"), atau menunda tindakan ini.`;
  return response;
}

/**
 * 3. Generate assistant explanation using Gemini with strict facts grounding.
 */
export async function generateAssistantResponse(
  contextPacket: StructuredContextPacket,
  userMessage: string,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{
  content: string;
  modelUsed: string;
  promptVersion: string;
  isFallback: boolean;
}> {
  const model = getGeminiModel();
  const systemInstruction = buildSystemInstruction(contextPacket.condition);

  // Format short recent chat history summary (max last 4 messages)
  const recentHistory = chatHistory.slice(-4);
  const historySummary = recentHistory
    .map((m) => `${m.role === "user" ? "Pengguna" : "Asisten"}: ${m.content}`)
    .join("\n\n");

  const userPrompt = buildUserPrompt(contextPacket, userMessage, historySummary);

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: DEFAULT_GENERATION_PARAMS.temperature,
        topP: DEFAULT_GENERATION_PARAMS.topP,
        maxOutputTokens: DEFAULT_GENERATION_PARAMS.maxOutputTokens,
      },
    });

    const reply = response.text?.trim();
    if (reply && reply.length > 20) {
      return {
        content: reply,
        modelUsed: model,
        promptVersion: "v1.0.0",
        isFallback: false,
      };
    }
  } catch {
    // If Gemini call fails, return the validated deterministic calculation fallback
  }

  return {
    content: generateSafeFallbackResponse(contextPacket, userMessage),
    modelUsed: model,
    promptVersion: "v1.0.0",
    isFallback: true,
  };
}
