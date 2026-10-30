import { FinancialAction } from "./types";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedAction?: FinancialAction;
}

export function validateFinancialAction(action: Partial<FinancialAction>): ValidationResult {
  const errors: string[] = [];

  if (!action.type || (action.type !== "spending" && action.type !== "saving")) {
    errors.push("Jenis tindakan keuangan harus ditentukan ('spending' atau 'saving').");
  }

  if (action.amount === undefined || action.amount === null) {
    errors.push("Nominal tindakan belum diisi.");
  } else if (!Number.isFinite(action.amount) || action.amount <= 0) {
    errors.push("Nominal tindakan harus berupa angka positif lebih besar dari 0.");
  } else if (action.amount > 1_000_000_000) {
    errors.push("Nominal tindakan melebihi batas wajar simulasi (maksimal Rp 1.000.000.000).");
  }

  if (!action.timing || typeof action.timing !== "string" || action.timing.trim() === "") {
    errors.push("Waktu pelaksanaan tindakan harus ditentukan.");
  }

  if (!action.targetCategory || typeof action.targetCategory !== "string") {
    errors.push("Pos atau kategori alokasi tindakan harus ditentukan.");
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
    };
  }

  return {
    isValid: true,
    errors: [],
    sanitizedAction: {
      type: action.type as "spending" | "saving",
      amount: Math.round(action.amount as number),
      timing: (action.timing as string).trim(),
      targetCategory: (action.targetCategory as string).trim(),
      description: action.description ? action.description.trim() : "",
      source: action.source || "scenario",
    },
  };
}

export function sanitizeAmount(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val) && val > 0) {
    return Math.round(val);
  }
  if (typeof val === "string") {
    // Clean currency string: "Rp 3.500.000", "3,500,000", "3.5jt", "3.5 juta"
    let clean = val.toLowerCase().replace(/rp|\s+/g, "");
    if (clean.includes("juta") || clean.includes("jt")) {
      const num = parseFloat(clean.replace(/juta|jt/g, "").replace(",", "."));
      if (!isNaN(num)) return Math.round(num * 1_000_000);
    }
    if (clean.includes("ribu") || clean.includes("rb") || clean.includes("k")) {
      const num = parseFloat(clean.replace(/ribu|rb|k/g, "").replace(",", "."));
      if (!isNaN(num)) return Math.round(num * 1_000);
    }
    // Remove dots/commas if formatted like 3.500.000
    clean = clean.replace(/\./g, "").replace(/,/g, "");
    const parsed = parseInt(clean, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

/**
 * Checks whether the user has introduced or disclosed their intended purchase,
 * saving plan, or action nominal in the conversation history.
 *
 * If the user has NOT mentioned the item or amount (e.g. only said "hi", "tes",
 * or asked general questions like "bagaimana kondisi keuangan saya?"), the chatbot
 * MUST NOT preemptively leak the scenario (e.g. "laptop", "Rp 7.000.000", "cicilan 12 bulan").
 */
export function hasUserDisclosedAction(
  chatHistory: Array<{ role: string; content: string }>,
  action: Partial<FinancialAction>
): boolean {
  // If the conversation already has an assistant response evaluating the action, it's already in progress
  const hasPriorEvaluation = chatHistory.some(
    (m) =>
      m.role === "assistant" &&
      (m.content.includes("Setelah pembelian") ||
        m.content.includes("Setelah penyisihan") ||
        m.content.includes("Berdasarkan evaluasi terhadap rencana") ||
        m.content.includes("skema cicilan 12 bulan"))
  );
  if (hasPriorEvaluation) return true;

  const userTexts = chatHistory
    .filter((m) => m.role === "user")
    .map((m) => m.content.toLowerCase())
    .join(" ");

  if (!userTexts.trim()) return false;

  // 1. Check if user asked about the impact / consequence of the decision/action
  if (
    /(?:apa dampaknya|bagaimana dampaknya|pengaruhnya terhadap|konsekuensi|dampak finansial|akibatnya terhadap|kelayakan rencana)/i.test(
      userTexts
    )
  ) {
    return true;
  }

  // 2. Check if user asked about nominal reduction / modification
  if (/(?:kurangi|dikurangi|turunkan|nominalnya|diubah|opsi lain)/i.test(userTexts)) {
    return true;
  }

  // 3. Check if user mentioned the nominal of the action
  const actionAmount = action.amount;
  if (actionAmount && actionAmount > 0) {
    const formattedAmount = actionAmount.toLocaleString("id-ID"); // e.g. "7.000.000" or "2.000.000"
    const unformattedAmount = String(actionAmount); // "7000000"
    const inMillions = actionAmount / 1_000_000;
    const millionRegex = new RegExp(`\\b${inMillions}\\s*(?:juta|jt)\\b`, "i");

    if (
      userTexts.includes(formattedAmount) ||
      userTexts.includes(unformattedAmount) ||
      millionRegex.test(userTexts)
    ) {
      return true;
    }
  }

  // 4. Check if user mentioned the specific target category / item or action
  if (action.type === "spending") {
    // Check for "laptop", "komputer", "pc", "gadget", "perangkat"
    if (/(?:laptop|komputer|notebook|macbook|pc\b|gadget|perangkat)/i.test(userTexts)) {
      return true;
    }
    // Check for payment options mentioned by user: "cicil", "cicilan", "kredit", "tunai", "cash"
    if (/(?:cicil|cicilan|angsuran|kredit|bayar tunai|beli tunai|opsi tunai)/i.test(userTexts)) {
      return true;
    }
    // Check for explicit purchase inquiry e.g. "beli seharga", "mau beli", "rencana beli"
    if (/(?:mau beli|ingin beli|rencana beli|pembelian seharga|beli seharga)/i.test(userTexts)) {
      return true;
    }
  } else if (action.type === "saving") {
    if (/(?:nabung|menabung|tabungan|simpan uang|deposito|setor|tambah.*dana darurat)/i.test(userTexts)) {
      return true;
    }
  }

  return false;
}
