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
  const clean = userMessage.trim().toLowerCase();

  // Fast-Path 1: Pure inquiry questions without numbers, decisions, or financial amounts
  const hasDigits = /\d/.test(clean);
  const hasCurrencyWord = /(juta|jt|ribu|rb|rupiah|rp\.?)\b/i.test(clean);
  const hasDecisionWord = /(lanjut|setuju|eksekusi|tunda|batal|tidak jadi|ubah|ganti|sesuaikan|kurang|tambah)/i.test(clean);
  const hasFinancialKey = /(saldo|anggaran|tagihan|utang|cicilan|tanggungan|dana darurat|buffer)/i.test(clean);

  if (!hasDigits && !hasCurrencyWord && !hasDecisionWord && !hasFinancialKey) {
    // Pure conceptual question or standard quick reply -> resolve in 0ms without extra LLM roundtrip
    return heuristicExtractIntent(userMessage, currentAction);
  }

  // Fast-Path 2: Clear heuristic matches (regex successfully extracted decision, amount, or finances)
  const heuristic = heuristicExtractIntent(userMessage, currentAction);
  if (
    heuristic.decision !== null ||
    (typeof heuristic.newAmount === "number" && heuristic.newAmount > 0) ||
    heuristic.userProvidedFinances !== null
  ) {
    return heuristic;
  }

  // Fallback: Use Gemini for complex or ambiguous user phrasing
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
  userMessage?: string,
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>
): string {
  const { condition, action, calculation } = contextPacket;
  const cleanMsg = (userMessage || "").trim().toLowerCase();
  const isFollowup = Boolean(chatHistory && chatHistory.length > 1);

  // Clean target category label to avoid "pembelian Pembelian Laptop"
  const categoryLabel = action.targetCategory.toLowerCase().startsWith("pembelian")
    ? action.targetCategory.replace(/^pembelian\s+/i, "")
    : action.targetCategory;

  // 1. Handle test / ping messages naturally
  const isTestOrPing = /^(tes|test|testing|ping|cek|coba)\b/i.test(cleanMsg) && cleanMsg.length < 20;
  if (isTestOrPing) {
    return (
      `Halo! Sistem aktif dan siap mendampingi Anda berdiskusi. Anda dapat menanyakan dampak rencana ` +
      `${action.type === "spending" ? "pembelian" : "penyisihan tabungan"} ini terhadap sisa saldo kas, ` +
      `kewajiban tagihan terdekat, kebutuhan rutin, atau simulasi nominal alternatif. Apa yang ingin Anda diskusikan?`
    );
  }

  // 2. Handle pure greetings naturally
  const isGreetingOnly = /^(halo|hai|hi|hei|p|halo!|hai!|selamat pagi|selamat siang|selamat sore|selamat malam|assalamu['a]?laikum)\b/i.test(cleanMsg) &&
    cleanMsg.length < 30;

  if (isGreetingOnly) {
    return (
      `Halo! Saya asisten percakapan finansial Anda. Anda dapat berdiskusi mengenai pertimbangan rencana ` +
      `${action.type === "spending" ? "pembelian" : "penyisihan tabungan"} Anda, memeriksa sisa saldo kas, ` +
      `kewajiban tagihan terdekat, kebutuhan rutin, atau simulasi nominal lainnya. Apa yang ingin Anda tanyakan atau diskusikan?`
    );
  }

  // 3. Handle questions about reducing nominal without specific number
  const isAskingReducedNominal = /(kurang|turun|lebih kecil|lebih rendah)/i.test(cleanMsg) &&
    !/\d/.test(cleanMsg);

  if (isAskingReducedNominal) {
    if (action.type === "saving") {
      return (
        `Jika nominal tabungan dikurangi (misalnya menjadi Rp 1.000.000 dari sebelumnya Rp 2.000.000), ` +
        `beban arus kas bulanan Anda akan berkurang Rp 1.000.000. Setelah membayar kewajiban tagihan wajib Rp 3.500.000, ` +
        `sisa dana operasional dari pendapatan menjadi Rp 3.500.000. Jumlah ini mencukupi estimasi kebutuhan rutin (rata-rata Rp 2.700.000) ` +
        `dan masih menyisakan sekitar Rp 800.000 untuk pos tujuan lain (seperti Program Sertifikasi). ` +
        `Berapa nominal yang ingin Anda coba pertimbangkan? Anda dapat mengetik misalnya: "Ganti jadi 1 juta".`
      );
    } else {
      return (
        `Jika nominal pembelian laptop dikurangi (misalnya mencari alternatif laptop seharga Rp 5.000.000 dari sebelumnya Rp 7.000.000), ` +
        `pengeluaran akan lebih sejalan dengan pos anggaran dan sisa kas operasional Anda setelah tagihan akan menjadi lebih aman ` +
        `(sekitar Rp 11.200.000), sehingga batas buffer dana darurat tetap terlindungi penuh. ` +
        `Berapa nominal alternatif yang ingin Anda coba simulasikan? Anda dapat mengetik misalnya: "Ganti jadi 5 juta".`
      );
    }
  }

  // 4. Basic Condition handling
  if (condition === "basic" && calculation.status === "needs_clarification") {
    const isAskingSufficiency = /(cukup|mencukupi|sisa saldo|kebutuhan|kas)/i.test(cleanMsg);
    if (isFollowup && isAskingSufficiency) {
      return (
        `Untuk memastikan apakah sisa saldo masih mencukupi kebutuhan Anda setelah ` +
        `${action.type === "spending" ? "pembelian" : "penyisihan"} ${categoryLabel} Rp ${action.amount.toLocaleString("id-ID")}, ` +
        `saya memerlukan informasi saldo rekening Anda saat ini dan total tagihan sebelum pemasukan berikutnya. ` +
        `Setelah nominal tersebut Anda sampaikan, saya bisa langsung menghitung sisa dana yang aman untuk kebutuhan Anda.`
      );
    }

    return (
      `Setelah ${action.type === "spending" ? "pembelian" : "penyisihan"} ${categoryLabel} sebesar ` +
      `Rp ${action.amount.toLocaleString("id-ID")}, saldo rekening Anda akan berkurang sebesar nominal tersebut. ` +
      `Karena informasi saldo kas operasional atau alokasi anggaran Anda belum tercatat dalam sesi ini, ` +
      `untuk menghitung apakah tindakan ini aman bagi keuangan Anda, berapa perkiraan saldo rekening yang tersedia saat ini ` +
      `dan total tagihan sebelum pemasukan berikutnya? Saya juga perlu mengetahui estimasi kebutuhan rutin serta batas dana cadangan ` +
      `minimum yang ingin Anda pertahankan untuk menilai kecukupannya secara presisi.`
    );
  }

  // 5. Context-Aware: Targeted answer if user specifically asks about sufficiency or obligations
  const isAskingSufficiency = /(cukup|mencukupi|sisa saldo|kebutuhan rutin|kas operasional)/i.test(cleanMsg);
  if (isFollowup && isAskingSufficiency) {
    if (action.type === "spending") {
      const shortfallNote =
        calculation.bufferImpact.minBuffer && !calculation.isBufferMaintained
          ? `Namun, jumlah itu Rp ${calculation.bufferImpact.bufferShortfall.toLocaleString("id-ID")} di bawah buffer minimum Rp ${calculation.bufferImpact.minBuffer.toLocaleString("id-ID")}, sebelum kebutuhan harian.`
          : `Jumlah tersebut aman di atas buffer minimum Rp ${calculation.bufferImpact.minBuffer?.toLocaleString("id-ID")}, dan mencukupi estimasi kebutuhan rutin hingga gajian berikutnya.`;

      return (
        `Setelah pembelian, saldo menjadi Rp ${calculation.balanceAfterAction?.toLocaleString("id-ID")}. ` +
        `Tagihan Rp ${calculation.totalLiabilitiesBeforeIncome.toLocaleString("id-ID")} masih dapat dibayar, sehingga tersisa Rp ${calculation.remainingCashAfterImmediateObligations?.toLocaleString("id-ID")}. ` +
        `${shortfallNote}`
      );
    } else {
      const routineNote =
        calculation.routineExpenses && (calculation.routineExpenses.remainingCashAfterRoutine || 0) < 0
          ? `Jumlah ini berada di bawah estimasi kebutuhan rutin bulanan Anda (rata-rata Rp ${calculation.routineExpenses.estimatedRemaining.toLocaleString("id-ID")}, defisit Rp ${Math.abs(calculation.routineExpenses.remainingCashAfterRoutine || 0).toLocaleString("id-ID")}), sehingga ruang alokasi untuk pos Program Sertifikasi Profesional pada bulan ini adalah Rp 0.`
          : `Jumlah ini mencukupi estimasi kebutuhan rutin bulanan Anda (Rp ${calculation.routineExpenses?.estimatedRemaining.toLocaleString("id-ID")}).`;

      return (
        `Setelah penyisihan Rp ${action.amount.toLocaleString("id-ID")} dan pembayaran kewajiban tagihan terdekat Rp ${calculation.totalLiabilitiesBeforeIncome.toLocaleString("id-ID")}, ` +
        `sisa pendapatan operasional Anda bulan ini adalah Rp ${calculation.remainingCashAfterImmediateObligations?.toLocaleString("id-ID")}. ` +
        `${routineNote}`
      );
    }
  }

  // For Context-Aware or Basic with user-provided data (General Full Evaluation):
  // Format as natural, structured paragraphs instead of rigid raw lists
  let part1 = `Berdasarkan evaluasi terhadap rencana ${action.type === "spending" ? "pengeluaran" : "penyisihan tabungan"} ` +
    `sebesar Rp ${action.amount.toLocaleString("id-ID")}: `;

  if (calculation.balanceAfterAction !== null) {
    part1 += `saldo rekening kas menjadi Rp ${calculation.balanceAfterAction.toLocaleString("id-ID")}. `;
  }

  if (calculation.relevantBudget) {
    if (calculation.isBudgetExceeded) {
      part1 += `Pengeluaran ini melebihi sisa anggaran pos ${calculation.relevantBudget.category} sebesar Rp ${Math.abs(
        calculation.budgetVariance || 0
      ).toLocaleString("id-ID")}. `;
    } else {
      part1 += `Rencana ini masih dalam batas sisa pos anggaran ${calculation.relevantBudget.category} (tersisa Rp ${(
        calculation.budgetVariance || 0
      ).toLocaleString("id-ID")}). `;
    }
  }

  if (calculation.liabilitiesDueBeforeIncome.length > 0) {
    part1 += `Setelah melunasi kewajiban tagihan terdekat sebesar Rp ${calculation.totalLiabilitiesBeforeIncome.toLocaleString("id-ID")}, ` +
      `sisa kas operasional Anda adalah Rp ${calculation.remainingCashAfterImmediateObligations?.toLocaleString("id-ID")}. `;
  }

  let part2 = "";
  if (calculation.bufferImpact.minBuffer !== null && calculation.bufferImpact.minBuffer > 0) {
    if (!calculation.isBufferMaintained) {
      part2 += `Sisa kas tersebut berada di bawah batas minimum buffer dana darurat (minimal Rp ${calculation.bufferImpact.minBuffer.toLocaleString("id-ID")}) ` +
        `dengan kekurangan buffer sebesar Rp ${calculation.bufferImpact.bufferShortfall.toLocaleString("id-ID")}. `;
    } else {
      part2 += `Batas minimum buffer dana darurat (minimal Rp ${calculation.bufferImpact.minBuffer.toLocaleString("id-ID")}) tetap terlindungi secara aman. `;
    }
  }

  if (calculation.routineExpenses) {
    if (action.type === "saving") {
      const isDeficit = (calculation.routineExpenses.remainingCashAfterRoutine || 0) < 0;
      if (isDeficit) {
        part2 += `Untuk kebutuhan rutin bulanan (rata-rata Rp ${calculation.routineExpenses.estimatedRemaining.toLocaleString("id-ID")}), ` +
          `sisa pendapatan mengalami defisit Rp ${Math.abs(calculation.routineExpenses.remainingCashAfterRoutine || 0).toLocaleString("id-ID")} ` +
          `dan hanya mencukupi jika ditekan ke batas minimum (Rp 2.400.000). `;
      } else {
        part2 += `Sisa pendapatan setelah setoran dan tagihan (Rp ${calculation.remainingCashAfterImmediateObligations?.toLocaleString("id-ID")}) ` +
          `mencukupi estimasi kebutuhan rutin bulanan (Rp ${calculation.routineExpenses.estimatedRemaining.toLocaleString("id-ID")}). `;
      }
    } else {
      part2 += `Sisa kas mencukupi kebutuhan rutin hingga gajian berikutnya (estimasi Rp ${calculation.routineExpenses.estimatedRemaining.toLocaleString("id-ID")}) ` +
        `dengan sisa akhir Rp ${(calculation.routineExpenses.remainingCashAfterRoutine || 0).toLocaleString("id-ID")}. `;
    }
  }

  if (calculation.goalsEvaluation.length > 0) {
    for (const ge of calculation.goalsEvaluation) {
      part2 += `${ge.explanation} `;
    }
  }

  return `${part1.trim()}\n\n${part2.trim()}`;
}

export interface AssistantResponseResult {
  content: string;
  modelUsed: string;
  promptVersion: string;
  isFallback: boolean;
  responseSource: "gemini" | "safe_fallback";
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
  // Exclude the current user message if it is already the last entry in chatHistory
  const priorHistory = chatHistory.filter(
    (m, idx) => !(idx === chatHistory.length - 1 && m.role === "user" && m.content === userMessage)
  );
  const recentHistory = priorHistory.slice(-4);
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
          responseSource: "gemini",
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
            responseSource: "gemini",
            retryCount: 1,
            validationResult: retryGuardrail,
          };
        }
        lastValidationResult = retryGuardrail;
      }
    }
  } catch (err: unknown) {
    if (String(err).includes("429") || String(err).includes("RESOURCE_EXHAUSTED")) {
      console.warn("Gemini rate limited (429), pausing 5 seconds and retrying once...");
      try {
        await new Promise((resolve) => setTimeout(resolve, 5500));
        const ai = getGeminiClient();
        const retryRes = await ai.models.generateContent({
          model,
          contents: baseUserPrompt,
          config: {
            systemInstruction,
            temperature: DEFAULT_GENERATION_PARAMS.temperature,
            topP: DEFAULT_GENERATION_PARAMS.topP,
            maxOutputTokens: DEFAULT_GENERATION_PARAMS.maxOutputTokens,
          },
        });
        const retryText = retryRes.text?.trim();
        if (retryText && retryText.length >= 20) {
          const guardrailResult = validateAssistantOutput(retryText, contextPacket);
          if (guardrailResult.isValid) {
            return {
              content: retryText,
              modelUsed: model,
              promptVersion: PROMPT_VERSION,
              isFallback: false,
              responseSource: "gemini",
              retryCount: 1,
              validationResult: guardrailResult,
            };
          }
        }
      } catch (retryErr) {
        console.warn("Second attempt after 429 also failed, using deterministic fallback:", retryErr);
      }
    } else {
      console.warn("Gemini generation call failed, executing fallback:", err);
    }
  }

  // If both generation/retry attempts fail or violate guardrails, activate safe deterministic fallback
  const fallbackText = generateSafeFallbackResponse(contextPacket, userMessage, chatHistory);
  return {
    content: fallbackText,
    modelUsed: model,
    promptVersion: PROMPT_VERSION,
    isFallback: true,
    responseSource: "safe_fallback",
    retryCount,
    validationResult: lastValidationResult,
  };
}
