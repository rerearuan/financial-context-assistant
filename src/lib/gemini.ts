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
 * Enhanced Heuristic Intent Extractor with 11 granular intent types,
 * focal dimensions, relative deltas, and constraint tracking.
 */
export function heuristicExtractIntent(
  userMessage: string,
  currentAction: StructuredContextPacket["action"]
): ExtractedIntent {
  const lower = userMessage.toLowerCase().trim();

  // 1. Detect pure greeting or ping
  const isGreetingOrPing =
    /^(halo|hai|hi|hei|p|halo!|hai!|tes|test|testing|ping|cek|coba|selamat (?:pagi|siang|sore|malam))\b/i.test(
      lower
    ) && lower.length < 35 && !/\d/.test(lower) && !/(aman|dampak|bisa|gimana|kenapa)/i.test(lower);

  if (isGreetingOrPing) {
    return {
      intentType: "greeting_or_ping",
      focalDimension: "general",
      newAmount: null,
      relativeDelta: null,
      newTiming: null,
      preferredPaymentMethod: null,
      userProvidedFinances: null,
      userConstraints: null,
      isAlternativeOnly: false,
      decision: null,
      summaryOfIntent: "Pengguna menyapa atau mengetes sistem",
    };
  }

  // 2. Detect decline / stop discussion
  const isDecline =
    /(?:ga|tidak|nggak|nda|tak) (?:butuh|usah|perlu)|cukup (?:deh|ya|dulu|sampai di sini)|batal diskusi|berhenti|stop\b/i.test(
      lower
    );
  if (isDecline) {
    return {
      intentType: "decline_discussion",
      focalDimension: "general",
      newAmount: null,
      relativeDelta: null,
      newTiming: null,
      preferredPaymentMethod: null,
      userProvidedFinances: null,
      userConstraints: null,
      isAlternativeOnly: false,
      decision: "cancel",
      summaryOfIntent: "Pengguna menolak atau ingin mengakhiri diskusi",
    };
  }

  // 3. Detect confusion / asking for clarification of terminology
  const isConfusion =
    /(?:maksudnya (?:gimana|apa)|bingung|pusing|ga paham|kurang paham|tidak paham|tidak mengerti|susah di(?:pahami|mengerti)|maksudmu apa)/i.test(
      lower
    );
  if (isConfusion) {
    return {
      intentType: "confusion",
      focalDimension: "general",
      newAmount: null,
      relativeDelta: null,
      newTiming: null,
      preferredPaymentMethod: null,
      userProvidedFinances: null,
      userConstraints: null,
      isAlternativeOnly: false,
      decision: null,
      summaryOfIntent: "Pengguna menyatakan kebingungan atau meminta penjelasan sederhana",
    };
  }

  // 4. Detect user constraints (e.g. "jangan pakai dana sertifikasi", "jangan sentuh")
  let userConstraints: ExtractedIntent["userConstraints"] = null;
  const isProhibitCertification =
    /(?:jangan|tidak boleh|tidak mau|ga mau|dilarang|tanpa).*(?:pakai|guna|sentuh|nyentuh|korban|ngorban|ambil).*sertifikasi/i.test(
      lower
    ) || /(?:pertahankan|amankan|lindungi).*sertifikasi/i.test(lower);

  const bufferConstraintMatch = lower.match(
    /(?:pertahankan|amankan|jaga) (?:buffer|cadangan|dana darurat) (?:minimal|sebesar)? (?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k)?)/i
  );

  if (isProhibitCertification || bufferConstraintMatch) {
    userConstraints = {
      prohibitCertificationFunds: isProhibitCertification ? true : undefined,
      maintainBufferAmount: bufferConstraintMatch
        ? sanitizeAmount(bufferConstraintMatch[1]) || undefined
        : undefined,
    };
  }

  // 5. Detect relative modification (e.g. "kurangi 500 ribu", "turunkan 1 juta", "tambah 500rb")
  let relativeDelta: number | null = null;
  const relativeMatch = lower.match(
    /(kurangi|turunkan|potong|tambah|naikkan)\s+(?:sebesar\s+)?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb|k|\.000)/i
  );
  if (relativeMatch) {
    const isNegative = /(kurangi|turunkan|potong)/i.test(relativeMatch[1]);
    const deltaVal = sanitizeAmount(`${relativeMatch[2]} ${relativeMatch[3]}`) || 0;
    relativeDelta = isNegative ? -deltaVal : deltaVal;
  }

  // 6. Detect decision words
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

  // 7. Look for new absolute amount
  let newAmount: number | null = null;
  const nominalMatch = userMessage.match(
    /(?:rp\.?\s*|\b)(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb|k|\.000)/i
  );
  if (nominalMatch) {
    newAmount = sanitizeAmount(nominalMatch[0]);
  } else {
    const rawNumMatch = userMessage.match(/\b\d{4,9}\b/);
    if (rawNumMatch) {
      newAmount = sanitizeAmount(rawNumMatch[0]);
    }
  }

  // 8. Look for user provided finances
  const balanceMatch = userMessage.match(
    /saldo(?:[^0-9]{0,30})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k)?)/i
  );
  const budgetMatch = userMessage.match(
    /anggaran(?:[^0-9]{0,30})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k)?)/i
  );
  const liabilitiesMatch = userMessage.match(
    /(?:tanggungan|kewajiban|tagihan|utang|cicilan)(?:[^0-9]{0,30})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k)?)/i
  );
  const bufferMatch = userMessage.match(
    /(?:dana darurat|buffer)(?:[^0-9]{0,30})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k)?)/i
  );
  const routineMatch = userMessage.match(
    /(?:kebutuhan (?:rutin|harian)|biaya hidup)(?:[^0-9]{0,30})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k)?)/i
  );

  let userProvidedFinances: ExtractedIntent["userProvidedFinances"] = null;
  if (balanceMatch || budgetMatch || liabilitiesMatch || bufferMatch || routineMatch) {
    userProvidedFinances = {
      balance: balanceMatch ? sanitizeAmount(balanceMatch[1]) || undefined : undefined,
      budget: budgetMatch ? sanitizeAmount(budgetMatch[1]) || undefined : undefined,
      liabilities: liabilitiesMatch ? sanitizeAmount(liabilitiesMatch[1]) || undefined : undefined,
      buffer: bufferMatch ? sanitizeAmount(bufferMatch[1]) || undefined : undefined,
      routine: routineMatch ? sanitizeAmount(routineMatch[1]) || undefined : undefined,
    };

    const hasModifyKeyword = /(ganti|ubah|harga|beli|jadinya|nominal|kalau)\b/i.test(userMessage);
    if (!hasModifyKeyword && newAmount) {
      if (
        newAmount === userProvidedFinances.balance ||
        newAmount === userProvidedFinances.budget ||
        newAmount === userProvidedFinances.liabilities ||
        newAmount === userProvidedFinances.buffer ||
        newAmount === userProvidedFinances.routine
      ) {
        newAmount = null;
      }
    }
  }

  // 9. Detect preferred payment method (Cash vs Installment)
  let preferredPaymentMethod: ExtractedIntent["preferredPaymentMethod"] = null;
  const isInstallment = /(cicil|cicilan|kredit|angsuran|tenor|12 bulan)/i.test(lower);
  const isCash = /(tunai|kontan|cash|langsung lunas)/i.test(lower);
  if (isInstallment) preferredPaymentMethod = "installment";
  else if (isCash) preferredPaymentMethod = "cash";

  // 10. Detect Focal Dimension
  let focalDimension: ExtractedIntent["focalDimension"] = "general";
  if (/(saldo|kas|uang kas)/i.test(lower)) focalDimension = "liquidity";
  else if (/(tagihan|kewajiban|utang|sewa|kartu kredit)/i.test(lower)) focalDimension = "bills";
  else if (/(kebutuhan rutin|belanja harian|biaya hidup)/i.test(lower)) focalDimension = "routine";
  else if (/(buffer|dana darurat)/i.test(lower)) focalDimension = "buffer";
  else if (/(sertifikasi|tujuan|laptop)/i.test(lower)) focalDimension = "goals";
  else if (isInstallment) focalDimension = "installment";
  else if (/(alternatif|pilihan lain|opsi)/i.test(lower)) focalDimension = "alternatives";

  // 11. Determine intentType
  let intentType: ExtractedIntent["intentType"] = "general_impact_query";

  if (userConstraints) {
    intentType = "constraint_setting";
  } else if (relativeDelta !== null) {
    intentType = "relative_modification";
  } else if (isInstallment || /(bagaimana jika|kalau|opsi lain)/i.test(lower)) {
    intentType = "alternative_exploration";
  } else if (decision) {
    intentType = "final_decision";
  } else if (newAmount && newAmount !== currentAction.amount) {
    intentType = "modify_action";
  } else if (userProvidedFinances) {
    intentType = "clarify_info";
  } else if (focalDimension !== "general") {
    intentType = "specific_aspect_query";
  } else if (/(saran|rekomendasi|sebaiknya)/i.test(lower)) {
    intentType = "advice_request";
  }

  return {
    intentType,
    focalDimension,
    newAmount,
    relativeDelta,
    newTiming: null,
    preferredPaymentMethod,
    userProvidedFinances,
    userConstraints,
    isAlternativeOnly: intentType === "alternative_exploration" || intentType === "relative_modification",
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

  // Fast-Path 1: Standard quick phrases & greetings
  const heuristic = heuristicExtractIntent(userMessage, currentAction);
  if (
    heuristic.intentType === "greeting_or_ping" ||
    heuristic.intentType === "decline_discussion" ||
    heuristic.intentType === "confusion" ||
    heuristic.intentType === "constraint_setting" ||
    heuristic.relativeDelta !== null ||
    (typeof heuristic.newAmount === "number" && heuristic.newAmount > 0) ||
    heuristic.userProvidedFinances !== null
  ) {
    return heuristic;
  }

  // Fast-Path 2: Pure inquiry without complex constructs
  const hasDigits = /\d/.test(clean);
  const hasCurrencyWord = /(juta|jt|ribu|rb|rupiah|rp\.?)\b/i.test(clean);
  const hasDecisionWord = /(lanjut|setuju|eksekusi|tunda|batal|tidak jadi|ubah|ganti|sesuaikan|kurang|tambah)/i.test(clean);
  const hasFinancialKey = /(saldo|anggaran|tagihan|utang|cicilan|tanggungan|dana darurat|buffer|sertifikasi)/i.test(clean);

  if (!hasDigits && !hasCurrencyWord && !hasDecisionWord && !hasFinancialKey) {
    return heuristic;
  }

  // Fallback: Call Gemini for complex ambiguity
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

  return heuristic;
}

/**
 * Generates a safe deterministic fallback response if Gemini is unavailable or fails guardrails.
 */
export function generateSafeFallbackResponse(
  contextPacket: StructuredContextPacket,
  userMessage?: string,
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>
): string {
  const { condition, action, calculation, conversationState, responsePlan } = contextPacket;
  const cleanMsg = (userMessage || "").trim().toLowerCase();
  const isFollowup = Boolean(chatHistory && chatHistory.length > 1);

  // 1. Sapaan / Tes
  if (responsePlan.intentType === "greeting_or_ping") {
    return (
      `Halo! Saya siap mendampingi Anda mengevaluasi rencana ` +
      `${action.type === "spending" ? "pengeluaran" : "penyisihan tabungan"} ini secara objektif sebelum Anda mengambil tindakan nyata. ` +
      `Ada aspek tertentu yang ingin Anda diskusikan mengenai rencana ini?`
    );
  }

  // 2. Penolakan Diskusi
  if (responsePlan.intentType === "decline_discussion") {
    return (
      `Baik, terima kasih atas waktu Anda berdiskusi. Ringkasan utamanya: pastikan pengeluaran atau tabungan yang Anda ambil ` +
      `tidak menekan kas operasional untuk kebutuhan rutin dan tagihan wajib. Keputusan akhir sepenuhnya berada di tangan Anda.`
    );
  }

  // 3. Kebingungan / Penjelasan Sederhana
  if (responsePlan.intentType === "confusion" || responsePlan.simplifyExplanation) {
    if (action.type === "saving") {
      return (
        `Singkatnya begini: Pendapatan bulan ini Rp 8.000.000. Jika langsung disisihkan Rp ${action.amount.toLocaleString("id-ID")} untuk tabungan ` +
        `dan Rp 3.500.000 untuk tagihan wajib, sisa uang operasional tinggal Rp ${(8000000 - action.amount - 3500000).toLocaleString("id-ID")}. ` +
        `Padahal kebutuhan hidup rutin rata-rata Rp 2.700.000. Artinya uang belanja bulanan Anda akan sangat ketat dan tidak menyisakan ruang untuk tabungan sertifikasi.`
      );
    } else {
      return (
        `Singkatnya begini: Dari saldo kas Rp 18.000.000, jika membeli laptop tunai Rp 7.000.000, sisa saldo kas Anda menjadi Rp 11.000.000. ` +
        `Setelah membayar tagihan wajib Rp 1.800.000 dalam 6 hari, sisa kas Anda adalah Rp 9.200.000. Jumlah ini masih aman di atas batas cadangan darurat (Rp 5.000.000).`
      );
    }
  }

  // 4. Batasan Pengguna (Constraint)
  if (responsePlan.intentType === "constraint_setting" || conversationState.userConstraints?.prohibitCertificationFunds) {
    return (
      `Batasan Anda dicatat: alokasi dana sertifikasi tetap dilindungi dan tidak boleh digunakan. ` +
      `Dengan melindungi pos sertifikasi, seluruh kebutuhan operasional harus dipenuhi dari sisa kas bulanan. ` +
      `Pastikan rencana ${action.type === "spending" ? "pengeluaran" : "tabungan"} disesuaikan agar tidak menimbulkan defisit pada kebutuhan rutin.`
    );
  }

  // 5. Cicilan vs Tunai (Spending)
  if (action.type === "spending" && (cleanMsg.includes("cicil") || responsePlan.intentType === "alternative_exploration")) {
    return (
      `Jika membeli laptop seharga Rp 7.000.000 dengan cicilan 12 bulan (bunga flat 1,2% per bulan dan admin 1%), kewajiban bulanan Anda ` +
      `adalah Rp 667.333 per bulan ditambah biaya administrasi Rp 70.000. Total dana yang Anda bayarkan selama 12 bulan menjadi Rp 8.078.000 ` +
      `(lebih mahal Rp 1.078.000 dibandingkan harga tunai).\n\n` +
      `Skema cicilan menjaga kas operasional bulan ini tetap longgar, namun menambah beban tagihan rutin bulanan selama 1 tahun ke depan. ` +
      `Sementara jika dibayar tunai, Anda berhemat Rp 1.078.000 dan kas setelah tagihan masih tersisa Rp 9.200.000 (aman di atas buffer Rp 5.000.000).`
    );
  }

  // 6. Pertanyaan Pengurangan Nominal Relatif
  if (responsePlan.intentType === "relative_modification" || cleanMsg.includes("kurang") || cleanMsg.includes("turun")) {
    if (action.type === "saving") {
      return (
        `Jika nominal tabungan dikurangi (misalnya menjadi Rp 1.000.000), beban kas operasional bulanan Anda menjadi lebih longgar. ` +
        `Setelah membayar tagihan wajib Rp 3.500.000, sisa pendapatan adalah Rp 3.500.000. Jumlah ini mencukupi kebutuhan rutin (rata-rata Rp 2.700.000) ` +
        `dan menyisakan ruang alokasi sekitar Rp 800.000 untuk Program Sertifikasi.`
      );
    } else {
      return (
        `Jika pengeluaran laptop dikurangi (misalnya menjadi Rp 6.000.000 atau Rp 5.000.000), pengeluaran akan sejalan dengan dana alokasi laptop ` +
        `dan menyisakan kas operasional yang lebih tebal di atas batas buffer dana darurat.`
      );
    }
  }

  // 7. Basic Condition
  if (condition === "basic" && calculation.status === "needs_clarification") {
    if (isFollowup) {
      return (
        `Setelah ${action.type === "spending" ? "pembelian" : "penyisihan"} sebesar Rp ${action.amount.toLocaleString("id-ID")}, ` +
        `saldo kas rekening Anda akan berkurang sebesar nominal tersebut. Untuk memastikan apakah sisa saldo masih mencukupi ` +
        `kebutuhan hidup dan tagihan terdekat, silakan bagikan perkiraan saldo rekening Anda saat ini dan total tagihan sebelum pemasukan berikutnya.`
      );
    }
    return (
      `Setelah ${action.type === "spending" ? "pembelian" : "penyisihan"} sebesar Rp ${action.amount.toLocaleString("id-ID")}, ` +
      `saldo rekening Anda akan berkurang sebesar nominal tersebut. Karena informasi saldo kas operasional atau alokasi anggaran Anda belum tercatat dalam sesi ini, ` +
      `untuk menghitung kelayakan rencana ini secara presisi, berapa perkiraan saldo rekening yang Anda miliki saat ini dan tagihan terdekat sebelum pemasukan berikutnya?`
    );
  }

  // 8. Context-Aware Targeted Response
  const isAskingSufficiency = /(cukup|mencukupi|sisa saldo|kebutuhan rutin|kas operasional)/i.test(cleanMsg);
  if (isFollowup && (responsePlan.focalDimension === "liquidity" || isAskingSufficiency)) {
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

  // 9. Context-Aware Full Skenario Evaluation
  let part1 = `Berdasarkan evaluasi terhadap rencana ${action.type === "spending" ? "pengeluaran" : "penyisihan tabungan"} ` +
    `sebesar Rp ${action.amount.toLocaleString("id-ID")}: `;

  if (calculation.balanceAfterAction !== null) {
    if (action.type === "saving") {
      part1 += `total saldo rekening bank Anda tetap Rp ${calculation.balanceAfterAction.toLocaleString("id-ID")} karena tabungan merupakan pemindahan pos di rekening yang sama. Kas operasional bulan berjalan menjadi Rp ${calculation.operatingCashAfterAction?.toLocaleString("id-ID")}. `;
    } else {
      part1 += `saldo kas rekening berkurang menjadi Rp ${calculation.balanceAfterAction.toLocaleString("id-ID")}. `;
    }
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

  if (calculation.totalLiabilitiesBeforeIncome > 0) {
    part1 += `Setelah melunasi tagihan wajib terdekat sebesar Rp ${calculation.totalLiabilitiesBeforeIncome.toLocaleString("id-ID")}, ` +
      `sisa kas operasional Anda adalah Rp ${calculation.remainingCashAfterImmediateObligations?.toLocaleString("id-ID")}. `;
  }

  let part2 = "";
  if (calculation.bufferImpact.minBuffer !== null && calculation.bufferImpact.minBuffer > 0) {
    if (!calculation.isBufferMaintained) {
      part2 += `Sisa kas tersebut berada di bawah batas minimum buffer dana darurat (minimal Rp ${calculation.bufferImpact.minBuffer.toLocaleString("id-ID")}) ` +
        `dengan kekurangan buffer sebesar Rp ${calculation.bufferImpact.bufferShortfall.toLocaleString("id-ID")}. `;
    } else {
      part2 += `Batas minimum buffer dana darurat (minimal Rp ${calculation.bufferImpact.minBuffer.toLocaleString("id-ID")}) tetap terlindungi aman. `;
    }
  }

  if (calculation.routineExpenses) {
    if (action.type === "saving") {
      const isDeficit = (calculation.routineExpenses.remainingCashAfterRoutine || 0) < 0;
      if (isDeficit) {
        part2 += `Untuk kebutuhan rutin bulanan (rata-rata Rp ${calculation.routineExpenses.estimatedRemaining.toLocaleString("id-ID")}), ` +
          `sisa kas mengalami defisit Rp ${Math.abs(calculation.routineExpenses.remainingCashAfterRoutine || 0).toLocaleString("id-ID")} ` +
          `dan hanya mencukupi jika ditekan ke batas minimum (Rp 2.400.000). Akibatnya, ruang alokasi untuk pos Program Sertifikasi Profesional bulan ini menjadi Rp 0.`;
      } else {
        part2 += `Sisa pendapatan setelah setoran dan tagihan (Rp ${calculation.remainingCashAfterImmediateObligations?.toLocaleString("id-ID")}) ` +
          `mencukupi estimasi kebutuhan rutin bulanan (Rp ${calculation.routineExpenses.estimatedRemaining.toLocaleString("id-ID")}).`;
      }
    } else {
      part2 += `Sisa kas mencukupi kebutuhan rutin hingga gajian berikutnya (estimasi Rp ${calculation.routineExpenses.estimatedRemaining.toLocaleString("id-ID")}) ` +
        `dengan sisa akhir Rp ${(calculation.routineExpenses.remainingCashAfterRoutine || 0).toLocaleString("id-ID")}.`;
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
  latencyMs: number;
  validationResult?: OutputValidationResult;
}

/**
 * 3. Generate assistant explanation using Gemini with strict facts grounding,
 * output guardrails, structured logging, and automated retry harness.
 */
export async function generateAssistantResponse(
  contextPacket: StructuredContextPacket,
  userMessage: string,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<AssistantResponseResult> {
  const startTime = Date.now();
  const model = getGeminiModel();
  const systemInstruction = buildSystemInstruction(contextPacket.condition);

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
      const guardrailResult = validateAssistantOutput(reply, contextPacket);
      if (guardrailResult.isValid) {
        const latencyMs = Date.now() - startTime;
        console.log(`[AssistantResponse] Success via Gemini (${model}) | Latency: ${latencyMs}ms | Intent: ${contextPacket.responsePlan.intentType}`);
        return {
          content: reply,
          modelUsed: model,
          promptVersion: PROMPT_VERSION,
          isFallback: false,
          responseSource: "gemini",
          retryCount: 0,
          latencyMs,
          validationResult: guardrailResult,
        };
      }

      // If guardrail failed, attempt 1 corrective retry
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
          temperature: 0.05,
          topP: DEFAULT_GENERATION_PARAMS.topP,
          maxOutputTokens: DEFAULT_GENERATION_PARAMS.maxOutputTokens,
        },
      });

      const retryReply = retryResponse.text?.trim();
      if (retryReply && retryReply.length >= 20) {
        const retryGuardrail = validateAssistantOutput(retryReply, contextPacket);
        if (retryGuardrail.isValid) {
          const latencyMs = Date.now() - startTime;
          console.log(`[AssistantResponse] Success via Gemini Retry (${model}) | Latency: ${latencyMs}ms`);
          return {
            content: retryReply,
            modelUsed: model,
            promptVersion: PROMPT_VERSION,
            isFallback: false,
            responseSource: "gemini",
            retryCount: 1,
            latencyMs,
            validationResult: retryGuardrail,
          };
        }
        lastValidationResult = retryGuardrail;
      }
    }
  } catch (err: unknown) {
    if (String(err).includes("429") || String(err).includes("RESOURCE_EXHAUSTED")) {
      console.warn("Gemini rate limited (429), pausing 5.5s and retrying once...");
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
            const latencyMs = Date.now() - startTime;
            return {
              content: retryText,
              modelUsed: model,
              promptVersion: PROMPT_VERSION,
              isFallback: false,
              responseSource: "gemini",
              retryCount: 1,
              latencyMs,
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

  // Activate safe deterministic fallback
  const fallbackText = generateSafeFallbackResponse(contextPacket, userMessage, chatHistory);
  const latencyMs = Date.now() - startTime;
  console.log(`[AssistantResponse] Deterministic Safe Fallback Activated | Latency: ${latencyMs}ms | Intent: ${contextPacket.responsePlan.intentType}`);
  return {
    content: fallbackText,
    modelUsed: model,
    promptVersion: PROMPT_VERSION,
    isFallback: true,
    responseSource: "safe_fallback",
    retryCount,
    latencyMs,
    validationResult: lastValidationResult,
  };
}
