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
import { sanitizeAmount, hasUserDisclosedAction } from "./financial-engine/validator";
import {
  validateAssistantOutput,
  OutputValidationResult,
  extractMentionedAmounts,
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
  const clean = lower;

  // 0. Format Directives Extraction (Local and Ongoing)
  let formatDirective: ExtractedIntent["formatDirective"] = null;
  if (/satu baris|1 baris|sebaris|dalam satu baris/i.test(lower)) {
    formatDirective = "one_line";
  } else if (/ya atau tidak,? dan berapa|ya atau tidak/i.test(lower)) {
    formatDirective = "yes_no_amount";
  } else if (/langsung nominalnya|langsung angkanya/i.test(lower)) {
    formatDirective = "nominal_only";
  } else if (/jangan banyak angka|dikit angka|sedikit angka/i.test(lower)) {
    formatDirective = "few_numbers";
  } else if (/tanpa angka|jangan pakai angka/i.test(lower)) {
    formatDirective = "no_numbers";
  } else if (/jawab bagian ini saja|fokus (?:ke|pada) bagian ini saja/i.test(lower)) {
    formatDirective = "specific_part_only";
  } else if (/mulai sekarang jawab singkat|seterusnya singkat/i.test(lower)) {
    formatDirective = "brief_ongoing";
  } else if (/mulai sekarang jelaskan detail|seterusnya detail/i.test(lower)) {
    formatDirective = "detailed_ongoing";
  } else if (/jelaskan detail|uraikan detail|secara detail|lebih detail|rincikan/i.test(lower)) {
    formatDirective = "detailed";
  } else if (/bandingkan|perbandingan|tabel perbandingan/i.test(lower)) {
    formatDirective = "compare";
  } else if (/jawab singkat|singkat saja|secara singkat/i.test(lower)) {
    formatDirective = "one_line";
  }

  // 0b. Thank You Detection
  const isThankYouOnly =
    /^(?:oke |baik |sip |siap |wah )?(?:terima\s*kasih|makasih|thanks|tq)(?:\s*(?:banyak|ya|mas|mbak|asisten|infonya|bantuannya|atas bantuannya|atas penjelasannya))*[.!]?$/i.test(
      lower.trim()
    );
  const containsThankYou = /(?:terima\s*kasih|makasih|thanks|tq)/i.test(lower);
  const isThankYouWithNewQuestion = containsThankYou && !isThankYouOnly;

  if (isThankYouOnly) {
    return {
      intentType: "thank_you",
      focalDimension: "general",
      formatDirective,
      newAmount: null,
      relativeDelta: null,
      newTiming: null,
      preferredPaymentMethod: null,
      userProvidedFinances: null,
      userConstraints: null,
      isAlternativeOnly: false,
      isThankYouWithNewQuestion: false,
      decision: null,
      summaryOfIntent: "Pengguna berterima kasih / menutup percakapan",
    };
  }

  // 1. Detect pure greeting or ping (Ensure composite messages like 'Halo, saya mau tabung tapi belum tahu berapa' are NOT treated as pure ping)
  const isGreetingOrPing =
    /^(halo|hai|hi|hei|p|halo!|hai!|tes|test|testing|ping|cek|coba|selamat (?:pagi|siang|sore|malam))\b/i.test(
      lower
    ) &&
    lower.length < 40 &&
    !/\d/.test(lower) &&
    !/(aman|dampak|bisa|gimana|kenapa|saran|bantu|hitung|berapa|tabung|nabung|laptop|pengeluaran|beli|rekomendasi|tahu|uang)/i.test(
      lower
    );

  if (isGreetingOrPing) {
    return {
      intentType: "greeting_or_ping",
      focalDimension: "general",
      formatDirective,
      newAmount: null,
      relativeDelta: null,
      newTiming: null,
      preferredPaymentMethod: null,
      userProvidedFinances: null,
      userConstraints: null,
      isAlternativeOnly: false,
      isThankYouWithNewQuestion: false,
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
  // Exclude nominal requests like "bingung mau nabung berapa"
  const isConfusion =
    !/(?:bingung (?:mau )?(?:nabung|sisihkan|beli|simpan) berapa)/i.test(lower) &&
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
  // Note: explicitly exclude estimation phrases like "kurang lebih"
  let relativeDelta: number | null = null;
  const isEstimationPhrase = /kurang lebih/i.test(lower);
  const relativeMatch = !isEstimationPhrase
    ? lower.match(
        /(kurangi|turunkan|potong|pangkas|tambah|naikkan)\s+(?:sebesar\s+)?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb|k|\.000)/i
      )
    : null;
  if (relativeMatch) {
    const isNegative = /(kurangi|turunkan|potong|pangkas)/i.test(relativeMatch[1]);
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
  } else if (
    !isEstimationPhrase &&
    (/(?:ubah|ganti nominal|sesuaikan)/i.test(lower) || /\bubah\b/i.test(lower))
  ) {
    decision = "modify";
  }

  // 7. Look for user provided finances (Extract first before newAmount to prevent capturing profile facts as plan modifications)
  const balanceMatch = userMessage.match(
    /(?:saldo(?:ku)?|isi rekening|tabungan total|uang di rekening)(?:[^0-9]{0,30})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)*\s*(?:juta|jt|ribu|rb|k)?)/i
  );
  const budgetMatch = userMessage.match(
    /anggaran(?:[^0-9]{0,30})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)*\s*(?:juta|jt|ribu|rb|k)?)/i
  );
  const incomeMatch = userMessage.match(
    /(?:gaji(?:ku)?|penghasilan|pendapatan|pemasukan|income)(?:[^0-9]{0,30})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)*\s*(?:juta|jt|ribu|rb|k)?)/i
  );
  const liabilitiesMatch = userMessage.match(
    /(?:tanggungan|kewajiban|tagihan|utang|cicilan|sewa)(?:[^0-9]{0,30})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)*\s*(?:juta|jt|ribu|rb|k)?)/i
  );
  const emergencyTargetMatch = userMessage.match(
    /(?:target(?:nya)?|tujuan)(?:[^0-9]{0,30})?(?:emergency fund|dana darurat|tabungan darurat)?(?:[^0-9]{0,20})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)*\s*(?:juta|jt|ribu|rb|k)?)/i
  );
  const bufferMatch = userMessage.match(
    /(?:dana darurat|buffer|emergency fund|tabungan darurat)(?:[^0-9]{0,30})?(?:saat ini|punya|sekarang|ada|sebesar)?(?:[^0-9]{0,20})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)*\s*(?:juta|jt|ribu|rb|k)?)/i
  );
  const routineMatch = userMessage.match(
    /(?:pengeluaran(?:ku)? (?:biasanya|rutin|bulanan|harian)?|kebutuhan (?:rutin|harian|bulanan)|biaya (?:hidup|rutin|bulanan)|belanja (?:rutin|bulanan|harian)|bulanan|biasanya habis|biasanya keluar|biasanya)(?:[^0-9]{0,30})?(?:kurang lebih|sekitar|kira-kira)?(?:[^0-9]{0,10})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)*\s*(?:juta|jt|ribu|rb|k)?)/i
  );
  const spentSoFarMatch = userMessage.match(
    /(?:sudah (?:keluar|terpakai|habis|belanja)|pengeluaran bulan berjalan)(?:[^0-9]{0,30})?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k)?)/i
  );

  const rawUserFigures = extractMentionedAmounts(userMessage);

  let userProvidedFinances: ExtractedIntent["userProvidedFinances"] = null;
  if (
    balanceMatch ||
    budgetMatch ||
    incomeMatch ||
    liabilitiesMatch ||
    bufferMatch ||
    emergencyTargetMatch ||
    routineMatch ||
    spentSoFarMatch
  ) {
    const rawBufferVal = bufferMatch ? sanitizeAmount(bufferMatch[1]) || undefined : undefined;
    const rawTargetVal = emergencyTargetMatch
      ? sanitizeAmount(emergencyTargetMatch[1]) || undefined
      : undefined;

    userProvidedFinances = {
      balance: balanceMatch ? sanitizeAmount(balanceMatch[1]) || undefined : undefined,
      budget: budgetMatch ? sanitizeAmount(budgetMatch[1]) || undefined : undefined,
      income: incomeMatch ? sanitizeAmount(incomeMatch[1]) || undefined : undefined,
      liabilities: liabilitiesMatch ? sanitizeAmount(liabilitiesMatch[1]) || undefined : undefined,
      buffer: rawBufferVal,
      routine: routineMatch ? sanitizeAmount(routineMatch[1]) || undefined : undefined,
      spentSoFar: spentSoFarMatch ? sanitizeAmount(spentSoFarMatch[1]) || undefined : undefined,
      emergencyCurrent: rawBufferVal,
      emergencyTarget: rawTargetVal,
      rawUserFigures: rawUserFigures.length > 0 ? rawUserFigures : undefined,
    };
  }

  // 8. Detect if user is asking system to recommend / calculate the nominal
  const isRequestingNominal =
    /(?:bingung (?:mau )?(?:nabung|sisihkan|simpan) berapa|kamu yang hitung|berapa yang aman|rekomendasi(?:kan)? (?:nominal|jumlah)|menurutmu berapa|sebaiknya berapa|belum tahu berapa|tentukan nominal|hitungin)/i.test(
      lower
    );

  // 8b. Look for new absolute amount (Only if explicitly modifying plan or inquiring alternative amount and NOT asking bot to decide)
  let newAmount: number | null = null;
  const isExplicitActionModification =
    !isRequestingNominal &&
    (/(?:ubah|ganti|jadikan|sesuaikan|jadi|coba|opsi|nabung|menabung|beli|keluarin|sisihkan|harga|nominal)\s+(?:menjadi\s+|sebesar\s+)?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k|\.000))/i.test(
      userMessage
    ) ||
      /bagaimana jika (?:saya )?(?:menyisihkan|beli|keluarkan)\s+(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k|\.000))/i.test(
        userMessage
      ));

  const hasSpecificAmountQuestion =
    !isRequestingNominal &&
    /^(?:bagaimana jika|kalau|opsi)\s+(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:juta|jt|ribu|rb|k|\.000))\??$/i.test(
      clean
    );

  if (isExplicitActionModification || hasSpecificAmountQuestion) {
    const actionNominalMatch = userMessage.match(
      /(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb|k|\.000)/i
    );
    if (actionNominalMatch) {
      const candidateAmt = sanitizeAmount(actionNominalMatch[0]);
      // Guard: do not treat user-provided income/routine/liabilities/buffer as new action amount
      const isFactAmount =
        userProvidedFinances &&
        (candidateAmt === userProvidedFinances.income ||
          candidateAmt === userProvidedFinances.routine ||
          candidateAmt === userProvidedFinances.liabilities ||
          candidateAmt === userProvidedFinances.balance ||
          candidateAmt === userProvidedFinances.buffer ||
          candidateAmt === userProvidedFinances.emergencyTarget);

      if (!isFactAmount) {
        newAmount = candidateAmt;
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

  // 10b. Detect Conceptual Question (user asks concept/principles without numbers)
  const isConceptual =
    /(?:apa itu|kenapa penting|mengapa penting|apa fungsi|kenapa harus|mengapa harus|apa tujuan|kenapa perlu|mengapa perlu).*(?:dana darurat|alokasi|menabung|budget|anggaran)/i.test(
      lower
    ) ||
    /(?:apa bedanya|apa beda|kelebihan dan kekurangan).*(?:tunai|cicilan)/i.test(lower);

  // 11. Determine intentType
  let intentType: ExtractedIntent["intentType"] = "general_impact_query";

  if (userConstraints) {
    intentType = "constraint_setting";
  } else if (relativeDelta !== null) {
    intentType = "relative_modification";
  } else if (isRequestingNominal) {
    intentType = "request_nominal_calculation";
  } else if (isConceptual) {
    intentType = "conceptual_question";
  } else if (/(saran|rekomendasi|sebaiknya|berapa yang aman)/i.test(lower)) {
    intentType = "advice_request";
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
  }

  return {
    intentType,
    focalDimension,
    formatDirective,
    newAmount,
    relativeDelta,
    newTiming: null,
    preferredPaymentMethod,
    userProvidedFinances,
    userConstraints,
    isAlternativeOnly: intentType === "alternative_exploration" || intentType === "relative_modification",
    isThankYouWithNewQuestion,
    isConceptualQuestion: isConceptual,
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

  const isDisclosed =
    contextPacket.hasUserDisclosedAction ??
    responsePlan?.hasUserDisclosedAction ??
    (chatHistory ? hasUserDisclosedAction(chatHistory, action) : true);

  // 0. Penutupan Percakapan (Terima Kasih)
  if (
    responsePlan.shouldCloseConversation ||
    responsePlan.intentType === "thank_you" ||
    cleanMsg.match(/^(?:oke |baik |sip |siap )?(?:terima\s*kasih|makasih|thanks|tq)(?:\s*(?:banyak|ya|mas|mbak|asisten|infonya))?[.!]?$/i)
  ) {
    return "Sama-sama, semoga membantu.";
  }

  // 0b. Deteksi Permintaan Format Khusus
  const effectiveFormat =
    responsePlan.localFormatInstruction ||
    conversationState.localFormatInstruction ||
    (conversationState.lengthPreference === "brief" || responsePlan.preferBriefResponse ? "one_line" : null) ||
    (conversationState.lengthPreference === "detailed" ? "detailed" : null);

  // Format Khusus: Satu Baris
  if (effectiveFormat === "one_line") {
    if (action.type === "spending") {
      if (cleanMsg.includes("pertimbangan")) {
        return "Pertimbangan utamanya adalah memastikan sisa uang di rekening Anda masih cukup untuk kebutuhan hidup dan tagihan wajib setelah pembelian.";
      }
      if (condition === "context_aware") {
        return "Saldo rekening Anda mencukupi untuk membeli tunai Rp 7.000.000 dan tagihan aman, tetapi uang belanja bulan ini berkurang cukup banyak.";
      }
      return "Pembelian tunai Rp 7.000.000 akan langsung memotong saldo rekening sebesar nominal tersebut.";
    } else {
      if (condition === "context_aware") {
        return "Penyisihan tabungan yang aman adalah Rp 1.000.000 agar uang kebutuhan belanja bulanan Anda tidak mengalami defisit.";
      }
      return "Menambah tabungan memindahkan uang kebutuhan bulan ini ke pos simpanan tanpa mengubah total saldo rekening.";
    }
  }

  // Format Khusus: Ya atau Tidak, dan Berapa
  if (effectiveFormat === "yes_no_amount") {
    if (action.type === "spending") {
      if (condition === "context_aware") {
        return "Ya, Anda bisa membeli tunai Rp 7.000.000 karena saldo dan tagihan terdekat masih aman di atas batas dana darurat.";
      }
      return "Belum dapat dipastikan ya atau tidaknya sebelum mengetahui saldo rekening dan tagihan wajib Anda.";
    } else {
      if (condition === "context_aware") {
        return "Ya, disarankan menambah Dana Darurat sebesar Rp 1.000.000 agar uang kebutuhan bulanan tetap aman.";
      }
      return "Ya, Anda bisa menabung dengan nominal yang disesuaikan setelah memastikan tagihan wajib bulanan terpenuhi.";
    }
  }

  // Format Khusus: Langsung Nominalnya
  if (effectiveFormat === "nominal_only") {
    if (action.type === "saving") {
      return "Nominal rekomendasi yang aman adalah Rp 1.000.000.";
    }
    return "Nominal pembelian tunai adalah Rp 7.000.000.";
  }

  // 0c. Pertanyaan Konseptual (Prinsip Umum)
  if (responsePlan.intentType === "conceptual_question") {
    if (cleanMsg.includes("dana darurat") || cleanMsg.includes("darurat")) {
      return "Dana darurat berfungsi sebagai bantalan pengaman keuangan untuk mengantisipasi pengeluaran mendadak yang tidak terduga tanpa harus mengganggu pos kebutuhan rutin atau berutang.";
    }
    if (cleanMsg.includes("tunai") || cleanMsg.includes("cicil")) {
      return "Pembelian tunai membebaskan Anda dari bunga dan biaya admin sehingga total biaya lebih hemat, sedangkan cicilan menjaga uang belanja bulan ini tetap longgar namun menambah beban tagihan tetap tiap bulan selama setahun ke depan.";
    }
    return "Pertimbangan utamanya adalah menjaga agar saldo rekening dan uang kebutuhan belanja Anda tetap aman sampai gajian berikutnya.";
  }

  // 1. Sapaan / Tes ATAU Pengguna belum mengungkapkan rencana belanja/tabungan
  if (responsePlan.intentType === "greeting_or_ping" || !isDisclosed) {
    if (condition === "basic") {
      if (cleanMsg.includes("saldo") || cleanMsg.includes("kondisi")) {
        return (
          "Untuk mengetahui kondisi keuangan dan sisa saldo Anda secara pasti saat ini, sistem belum mencatat informasi mengenai jumlah saldo maupun pengeluaran rutin Anda. " +
          "Berapa perkiraan saldo rekening yang Anda miliki saat ini, atau ada rencana transaksi yang ingin Anda evaluasi?"
        );
      }
      return (
        "Halo! Saya asisten finansial Anda. Ada keputusan atau rencana keuangan yang ingin Anda konsultasikan hari ini?"
      );
    } else {
      if (cleanMsg.includes("tagihan") || cleanMsg.includes("kewajiban")) {
        return (
          `Kewajiban tagihan terdekat Anda sebelum gajian berikutnya adalah sebesar Rp ${(calculation.totalLiabilitiesBeforeIncome || 1800000).toLocaleString("id-ID")}. ` +
          `Ada rencana pengeluaran atau tabungan tertentu yang sedang Anda pertimbangkan?`
        );
      }
      if (cleanMsg.includes("saldo") || cleanMsg.includes("kondisi")) {
        return (
          `Saldo rekening Anda saat ini adalah Rp ${(calculation.initialBalance || 18000000).toLocaleString("id-ID")}. ` +
          `Dari saldo tersebut, terdapat tagihan wajib terdekat Rp ${(calculation.totalLiabilitiesBeforeIncome || 1800000).toLocaleString("id-ID")}. ` +
          `Ada rencana transaksi atau keputusan belanja yang ingin Anda diskusikan?`
        );
      }
      return (
        "Halo! Saya asisten finansial Anda. Ada keputusan atau rencana keuangan yang ingin Anda konsultasikan hari ini?"
      );
    }
  }

  // 1b. Permintaan Rekomendasi Nominal (Saving) / Bantuan Hitung
  if (
    action.type === "saving" &&
    (responsePlan.intentType === "request_nominal_calculation" ||
      responsePlan.intentType === "advice_request" ||
      responsePlan.requestingNominalRecommendation)
  ) {
    const recAmt = calculation.recommendedAmount || 1000000;
    const baseSurplus = calculation.baselineSurplusBeforeAction || 1800000;
    return (
      `Sebelum menyisihkan tabungan, surplus uang kebutuhan bulanan Anda dari pendapatan adalah Rp ${baseSurplus.toLocaleString("id-ID")} ` +
      `(setelah tagihan wajib dan estimasi kebutuhan rutin).\n\n` +
      `Rekomendasi alokasi tabungan yang aman adalah Rp ${recAmt.toLocaleString("id-ID")} karena masih menyisakan cadangan uang belanja sebesar Rp ${(baseSurplus - recAmt).toLocaleString("id-ID")}. ` +
      `Jika Anda menabung Rp 2.000.000, arus kas belanja bulanan Anda akan mengalami defisit sekitar Rp 200.000 terhadap kebutuhan hidup rutin.`
    );
  }

  // 1c. Pertanyaan Keputusan Akhir & Metode Pembayaran (Tunai vs Cicil)
  const isAskingFinalOrMethod =
    /(?:keputusan akhirnya|beli atau ngga|beli atau tidak|jadi beli|pilih mana|metode tunai atau cicil|tunai atau cicil)/i.test(
      cleanMsg
    );
  if (isAskingFinalOrMethod && action.type === "spending") {
    if (condition === "context_aware") {
      if (calculation.commitmentsShortfall && calculation.commitmentsShortfall > 0) {
        return (
          `Untuk keputusan pembelian laptop tunai Rp 7.000.000, Anda perlu berhati-hati: setelah tagihan wajib (Rp 1.800.000) dan kebutuhan rutin 12 hari (Rp 1.800.000), ` +
          `sisa saldo rekening Anda adalah Rp 7.400.000. Untuk mempertahankan Dana Darurat Rp 5.000.000 dan Alokasi Sertifikasi Rp 3.000.000 sekaligus dibutuhkan Rp 8.000.000, ` +
          `sehingga terjadi selisih kekurangan (shortfall) Rp 600.000. Jika sertifikasi prioritas utama, pertimbangkan menunda atau mengevaluasi opsi lain.`
        );
      }
      return (
        `Secara keuangan, pembelian tunai Rp 7.000.000 lebih disarankan karena sisa saldo Anda setelah tagihan adalah Rp 9.200.000 ` +
        `(aman di atas batas Dana Darurat Rp 5.000.000) dan kebutuhan rutin 12 hari tercukupi, sekaligus menghemat biaya bunga dan administrasi Rp 1.078.000 dibandingkan opsi cicilan.`
      );
    } else {
      return (
        `Keputusan akhir bergantung pada ketersediaan dana dan kelonggaran anggaran Anda: ` +
        `Pembelian tunai lebih menguntungkan karena Anda terbebas dari beban bunga dan biaya administrasi tambahan. ` +
        `Namun, jika saldo rekening Anda terbatas atau mendekati dana darurat, menunda pembelian atau mencari opsi cicilan yang terjangkau dapat dipertimbangkan agar uang kebutuhan harian tidak terganggu.`
      );
    }
  }

  // 2. Penolakan Diskusi
  if (responsePlan.intentType === "decline_discussion") {
    return (
      `Baik, terima kasih atas diskusinya. Ringkasan utamanya: pastikan keputusan keuangan Anda tetap menjaga uang kebutuhan belanja rutin dan tagihan wajib aman sampai gajian. Keputusan akhir sepenuhnya berada di tangan Anda.`
    );
  }

  // 3. Kebingungan / Penjelasan Sederhana
  if (responsePlan.intentType === "confusion" || responsePlan.simplifyExplanation) {
    if (action.type === "saving") {
      const routineAmount = calculation.routineExpenses?.estimatedRemaining;
      const liabilitiesAmount = calculation.totalLiabilitiesBeforeIncome;
      const incomeAmount = contextPacket.availableProfile?.incomeSchedule?.amount;
      const incomeStr = incomeAmount ? ` (Rp ${incomeAmount.toLocaleString("id-ID")})` : "";
      return (
        `Singkatnya begini: Dari pendapatan bulanan Anda${incomeStr}, jika langsung disisihkan Rp ${action.amount.toLocaleString("id-ID")} untuk tabungan ` +
        (liabilitiesAmount > 0 ? `dan Rp ${liabilitiesAmount.toLocaleString("id-ID")} untuk tagihan wajib, ` : `, `) +
        `sisa uang kebutuhan bulan ini menjadi Rp ${(calculation.remainingCashAfterImmediateObligations ?? 0).toLocaleString("id-ID")}. ` +
        (routineAmount
          ? `Padahal kebutuhan belanja bulanan Anda berkisar Rp ${routineAmount.toLocaleString("id-ID")}. ` +
            ((calculation.routineExpenses?.remainingCashAfterRoutine ?? 0) < 0
              ? `Artinya uang belanja harian akan mengalami defisit dan terlalu ketat.`
              : `Jumlah ini mencukupi kebutuhan hidup Anda.`)
          : `Pastikan sisa dana tersebut cukup untuk kebutuhan hidup hingga gajian berikutnya.`)
      );
    } else {
      return (
        `Singkatnya begini: Dari saldo rekening Anda, jika melakukan pembelian Rp ${action.amount.toLocaleString("id-ID")}, ` +
        `saldo menjadi Rp ${(calculation.balanceAfterAction ?? 0).toLocaleString("id-ID")}. ` +
        (calculation.totalLiabilitiesBeforeIncome > 0
          ? `Setelah membayar tagihan wajib Rp ${calculation.totalLiabilitiesBeforeIncome.toLocaleString("id-ID")}, sisa uang Anda adalah Rp ${(calculation.remainingCashAfterImmediateObligations ?? 0).toLocaleString("id-ID")}. `
          : "") +
        (calculation.bufferImpact.minBuffer
          ? calculation.isBufferMaintained
            ? `Jumlah ini aman di atas batas dana darurat (Rp ${calculation.bufferImpact.minBuffer.toLocaleString("id-ID")}).`
            : `Jumlah ini berada di bawah batas cadangan dana darurat (Rp ${calculation.bufferImpact.minBuffer.toLocaleString("id-ID")}).`
          : "")
      );
    }
  }

  // 4. Batasan Pengguna (Constraint)
  if (responsePlan.intentType === "constraint_setting" || conversationState.userConstraints?.prohibitCertificationFunds) {
    return (
      `Batasan Anda dicatat: alokasi pos dana khusus tetap dilindungi dan tidak boleh digunakan. ` +
      `Dengan melindungi pos tersebut, seluruh kebutuhan pengeluaran harus dipenuhi dari sisa uang belanja berjalan. ` +
      `Pastikan rencana ${action.type === "spending" ? "pengeluaran" : "tabungan"} disesuaikan agar tidak menimbulkan defisit pada kebutuhan rutin.`
    );
  }

  // 5. Cicilan vs Tunai (Spending)
  if (action.type === "spending" && (cleanMsg.includes("cicil") || responsePlan.intentType === "alternative_exploration")) {
    if (calculation.installmentDetails) {
      const inst = calculation.installmentDetails;
      return (
        `Jika menggunakan skema cicilan 12 bulan (bunga flat 1,2% per bulan dan admin 1%), kewajiban bulanan Anda ` +
        `adalah Rp ${inst.monthlyTotalInstallment.toLocaleString("id-ID")} per bulan ditambah biaya administrasi Rp ${inst.adminFee.toLocaleString("id-ID")}. Total dana yang Anda bayarkan selama 12 bulan menjadi Rp ${inst.totalPayment12Months.toLocaleString("id-ID")} ` +
        `(selisih Rp ${inst.excessOverCash.toLocaleString("id-ID")} lebih mahal dibandingkan harga tunai).\n\n` +
        `Skema cicilan menjaga uang kebutuhan belanja bulan ini tetap longgar, namun menambah beban tagihan rutin bulanan selama 1 tahun ke depan.`
      );
    }
  }

  // 6. Pertanyaan Pengurangan Nominal Relatif
  const isRelativeReduction =
    responsePlan.intentType === "relative_modification" ||
    (/(kurangi|turunkan|potong|pangkas)\b/i.test(cleanMsg) && !/kurang lebih/i.test(cleanMsg));
  if (isRelativeReduction) {
    if (action.type === "saving") {
      const altSavingAmount = 1000000;
      return (
        `Jika nominal tabungan disesuaikan lebih rendah (misalnya menjadi Rp ${altSavingAmount.toLocaleString("id-ID")}), ` +
        `uang kebutuhan bulanan Anda menjadi lebih longgar. ` +
        (calculation.routineExpenses
          ? `Kebutuhan rutin bulanan Anda (rata-rata Rp ${calculation.routineExpenses.estimatedRemaining.toLocaleString("id-ID")}) akan lebih aman terpenuhi tanpa membebani arus kas.`
          : `Hal ini memberi ruang yang lebih aman untuk kebutuhan rutin dan tagihan mendatang.`)
      );
    } else {
      return (
        `Jika nominal pengeluaran dikurangi, pengeluaran akan sejalan dengan kapasitas uang belanja ` +
        `dan menyisakan saldo rekening yang lebih aman di atas batas cadangan dana darurat.`
      );
    }
  }

  // 7. Basic Condition
  if (condition === "basic" && calculation.status === "needs_clarification") {
    const uf = conversationState.userProvidedFacts;
    if (uf.routine && !uf.balance) {
      return (
        `Informasi pengeluaran rutin Anda sekitar Rp ${uf.routine.toLocaleString("id-ID")} sudah kami catat. ` +
        `Untuk menilai apakah pembelian laptop Rp ${action.amount.toLocaleString("id-ID")} aman dilakukan, berapa perkiraan saldo rekening Anda saat ini?`
      );
    }
    if (uf.balance && !uf.routine) {
      const sisa = uf.balance - action.amount;
      return (
        `Dari saldo rekening Rp ${uf.balance.toLocaleString("id-ID")}, setelah pembelian laptop Rp ${action.amount.toLocaleString("id-ID")} tersisa saldo Rp ${sisa.toLocaleString("id-ID")}. ` +
        `Sebelum menilai kelayakan akhirnya, apakah ada tagihan terdekat atau kebutuhan rutin yang perlu dipertahankan sampai gajian berikutnya?`
      );
    }
    if (isFollowup) {
      const isAskingConcept = /(pertimbangan|kenapa|mengapa|bagaimana|apa alasannya)/i.test(cleanMsg);
      if (isAskingConcept) {
        return (
          `Pertimbangan utamanya adalah memastikan uang di rekening Anda tidak habis terpotong pembelian laptop, ` +
          `sehingga Anda tidak mengalami kekurangan uang belanja untuk tagihan dan kebutuhan harian sampai gajian tiba.`
        );
      }
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
  const isAskingSufficiency = /(cukup|mencukupi|sisa saldo|kebutuhan rutin|kas operasional|uang belanja)/i.test(cleanMsg);
  if (isFollowup && (responsePlan.focalDimension === "liquidity" || isAskingSufficiency)) {
    if (action.type === "spending") {
      const shortfallNote =
        calculation.bufferImpact.minBuffer && !calculation.isBufferMaintained
          ? `Namun, jumlah itu Rp ${calculation.bufferImpact.bufferShortfall.toLocaleString("id-ID")} di bawah batas minimum Rp ${calculation.bufferImpact.minBuffer.toLocaleString("id-ID")}, sebelum kebutuhan harian.`
          : `Jumlah tersebut aman di atas batas minimum Rp ${calculation.bufferImpact.minBuffer?.toLocaleString("id-ID")}, dan mencukupi estimasi kebutuhan rutin hingga gajian berikutnya.`;

      return (
        `Setelah pembelian, saldo menjadi Rp ${calculation.balanceAfterAction?.toLocaleString("id-ID")}. ` +
        `Tagihan Rp ${calculation.totalLiabilitiesBeforeIncome.toLocaleString("id-ID")} masih dapat dibayar, sehingga tersisa Rp ${calculation.remainingCashAfterImmediateObligations?.toLocaleString("id-ID")}. ` +
        `${shortfallNote}`
      );
    } else {
      let goalSufficiencyNote = "";
      if (calculation.goalsEvaluation.length > 0) {
        goalSufficiencyNote = calculation.goalsEvaluation.map((g) => {
          if (g.isUntouchedAndProtected) {
            return `Pos alokasi ${g.title} tetap terlindungi aman.`;
          }
          return `Ruang alokasi untuk pos ${g.title} pada bulan ini adalah Rp 0.`;
        }).join(" ");
      }

      const routineNote =
        calculation.routineExpenses && (calculation.routineExpenses.remainingCashAfterRoutine || 0) < 0
          ? `Jumlah ini berada di bawah estimasi kebutuhan rutin bulanan Anda (rata-rata Rp ${calculation.routineExpenses.estimatedRemaining.toLocaleString("id-ID")}, defisit Rp ${Math.abs(calculation.routineExpenses.remainingCashAfterRoutine || 0).toLocaleString("id-ID")}). ${goalSufficiencyNote}`.trim()
          : `Jumlah ini mencukupi estimasi kebutuhan rutin bulanan Anda (Rp ${calculation.routineExpenses?.estimatedRemaining.toLocaleString("id-ID")}). ${goalSufficiencyNote}`.trim();

      return (
        `Setelah penyisihan Rp ${action.amount.toLocaleString("id-ID")} dan pembayaran kewajiban tagihan terdekat Rp ${calculation.totalLiabilitiesBeforeIncome.toLocaleString("id-ID")}, ` +
        `sisa uang kebutuhan bulan ini adalah Rp ${calculation.remainingCashAfterImmediateObligations?.toLocaleString("id-ID")}. ` +
        `${routineNote}`
      );
    }
  }

  // 9. Context-Aware Full Skenario Evaluation
  let part1 = "";
  if (action.type === "spending") {
    part1 = `Jika melakukan pembelian tunai Rp ${action.amount.toLocaleString("id-ID")}, saldo rekening Anda berkurang menjadi Rp ${calculation.balanceAfterAction?.toLocaleString("id-ID")}. `;
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
        `sisa uang Anda adalah Rp ${calculation.remainingCashAfterImmediateObligations?.toLocaleString("id-ID")}. `;
    }
  } else {
    part1 = `Menyisihkan Rp ${action.amount.toLocaleString("id-ID")} ke Dana Darurat memindahkan alokasi ke pos tabungan, sehingga total saldo rekening Anda tetap utuh Rp ${calculation.balanceAfterAction?.toLocaleString("id-ID")}. `;
    if (calculation.totalLiabilitiesBeforeIncome > 0) {
      part1 += `Setelah membayar tagihan wajib terdekat Rp ${calculation.totalLiabilitiesBeforeIncome.toLocaleString("id-ID")}, ` +
        `sisa uang kebutuhan bulan ini adalah Rp ${calculation.remainingCashAfterImmediateObligations?.toLocaleString("id-ID")}. `;
    }
  }

  let part2 = "";
  if (calculation.bufferImpact.minBuffer !== null && calculation.bufferImpact.minBuffer > 0) {
    if (!calculation.isBufferMaintained) {
      part2 += `Sisa saldo tersebut berada di bawah batas minimum dana darurat (minimal Rp ${calculation.bufferImpact.minBuffer.toLocaleString("id-ID")}) ` +
        `dengan kekurangan sebesar Rp ${calculation.bufferImpact.bufferShortfall.toLocaleString("id-ID")}. `;
    } else {
      part2 += `Batas dana darurat (minimal Rp ${calculation.bufferImpact.minBuffer.toLocaleString("id-ID")}) tetap terlindungi aman. `;
    }
  }

  if (calculation.routineExpenses) {
    if (action.type === "saving") {
      const isDeficit = (calculation.routineExpenses.remainingCashAfterRoutine || 0) < 0;
      if (isDeficit) {
        part2 += `Untuk kebutuhan rutin bulanan (rata-rata Rp ${calculation.routineExpenses.estimatedRemaining.toLocaleString("id-ID")}), ` +
          `uang belanja harian mengalami defisit Rp ${Math.abs(calculation.routineExpenses.remainingCashAfterRoutine || 0).toLocaleString("id-ID")}. `;
        if (calculation.goalsEvaluation.length > 0) {
          part2 += calculation.goalsEvaluation.map(g => `Ruang alokasi untuk pos ${g.title} bulan ini menjadi Rp 0.`).join(" ");
        }
      } else {
        part2 += `Sisa uang setelah setoran dan tagihan (Rp ${calculation.remainingCashAfterImmediateObligations?.toLocaleString("id-ID")}) ` +
          `mencukupi estimasi kebutuhan rutin bulanan (Rp ${calculation.routineExpenses.estimatedRemaining.toLocaleString("id-ID")}).`;
      }
    } else {
      part2 += `Sisa saldo mencukupi kebutuhan rutin hingga gajian berikutnya (estimasi Rp ${calculation.routineExpenses.estimatedRemaining.toLocaleString("id-ID")}) ` +
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

  // Determine whether user has introduced/disclosed the action
  const isDisclosed =
    contextPacket.hasUserDisclosedAction ??
    contextPacket.responsePlan?.hasUserDisclosedAction ??
    hasUserDisclosedAction(chatHistory, contextPacket.action);

  contextPacket.hasUserDisclosedAction = isDisclosed;
  if (contextPacket.responsePlan) {
    contextPacket.responsePlan.hasUserDisclosedAction = isDisclosed;
  }

  const priorHistory = chatHistory.filter(
    (m, idx) => !(idx === chatHistory.length - 1 && m.role === "user" && m.content === userMessage)
  );
  const recentHistory = priorHistory.slice(-4);
  const historySummary = recentHistory
    .map((m) => `${m.role === "user" ? "Pengguna" : "Asisten"}: ${m.content}`)
    .join("\n\n");

  const baseUserPrompt = buildUserPrompt(contextPacket, userMessage, historySummary, isDisclosed);

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
