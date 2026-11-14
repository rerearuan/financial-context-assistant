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
    let raw = val.trim().toLowerCase();
    if (!raw) return null;

    // Exclude pure duration/time/count phrases if passed directly into sanitizeAmount
    if (/^\d+(?:[.,]\d+)?\s*(?:hari|minggu|bulan|tahun|thn|bln|hr|x|kali|orang|item|unit|persen|%)$/i.test(raw)) {
      return null;
    }

    // Handle spoken Indonesian numbers (e.g. "sejuta", "satu koma lima juta", "satu juta tiga ratus", "setengah juta")
    if (/(?:sejuta|satu\s*juta|setengah\s*juta|koma.*juta|ratus\s*ribu)/i.test(raw)) {
      const wordToDigit: Record<string, number> = {
        nol: 0,
        satu: 1,
        dua: 2,
        tiga: 3,
        empat: 4,
        lima: 5,
        enam: 6,
        tujuh: 7,
        delapan: 8,
        sembilan: 9,
      };
      if (/^sejuta(?:\s+saja|\s+aja)?$/i.test(raw)) return 1_000_000;
      if (/^setengah\s*juta$/i.test(raw)) return 500_000;

      const komaJutaMatch = raw.match(
        /\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)\s+koma\s+(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)\s*juta/i
      );
      if (komaJutaMatch) {
        const d1 = wordToDigit[komaJutaMatch[1].toLowerCase()];
        const d2 = wordToDigit[komaJutaMatch[2].toLowerCase()];
        if (d1 !== undefined && d2 !== undefined) {
          return (d1 * 10 + d2) * 100_000;
        }
      }

      const jutaRatusMatch = raw.match(
        /\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|se)\s*juta\s+(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)\s*ratus(?:\s*ribu)?/i
      );
      if (jutaRatusMatch) {
        const d1 = jutaRatusMatch[1].toLowerCase() === "se" ? 1 : wordToDigit[jutaRatusMatch[1].toLowerCase()];
        const d2 = wordToDigit[jutaRatusMatch[2].toLowerCase()];
        if (d1 !== undefined && d2 !== undefined) {
          return d1 * 1_000_000 + d2 * 100_000;
        }
      }

      const ratusRibuMatch = raw.match(
        /\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|se)\s*ratus\s*ribu/i
      );
      if (ratusRibuMatch) {
        const d1 = ratusRibuMatch[1].toLowerCase() === "se" ? 1 : wordToDigit[ratusRibuMatch[1].toLowerCase()];
        if (d1 !== undefined) return d1 * 100_000;
      }
    }

    // Clean currency string: "Rp 3.500.000", "3,500,000", "3.5jt", "3.5 juta", "2.3 juta", "1,5 juta", "750rb"
    let clean = raw.replace(/rp\.?|rupiah|\s+/g, "");
    if (clean.includes("juta") || clean.includes("jt")) {
      const numPart = clean.replace(/juta.*|jt.*/g, "").replace(",", ".");
      const num = parseFloat(numPart);
      if (!isNaN(num) && num > 0) return Math.round(num * 1_000_000);
    }
    if (clean.includes("ribu") || clean.includes("rb") || /\d+k$/i.test(clean)) {
      const numPart = clean.replace(/ribu.*|rb.*|k$/g, "").replace(",", ".");
      const num = parseFloat(numPart);
      if (!isNaN(num) && num > 0) return Math.round(num * 1_000);
    }

    // Check if decimal without explicit unit is actually shorthand for juta (e.g. "1.5", "1,5", "2.3", "4,5" where 1 or 2 decimal digits)
    // Note: "1.500.000" has 3 digits after dot, so it is NOT decimal juta. "500.000" has 3 digits after dot, NOT decimal juta.
    if (/^\d{1,2}[.,]\d{1,2}$/.test(clean)) {
      const num = parseFloat(clean.replace(",", "."));
      if (!isNaN(num) && num > 0) {
        return Math.round(num * 1_000_000);
      }
    }

    // Remove dots/commas if formatted like 1.500.000 or 3,500,000
    clean = clean.replace(/\./g, "").replace(/,/g, "");
    const parsed = parseInt(clean, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

/**
 * Extracts spoken Indonesian nominal from text if present (e.g. "satu koma lima juta", "satu juta tiga ratus", "sejuta").
 */
export function extractSpokenIndonesianAmount(text: string): number | null {
  const lower = text.toLowerCase();
  const wordToDigit: Record<string, number> = {
    satu: 1,
    dua: 2,
    tiga: 3,
    empat: 4,
    lima: 5,
    enam: 6,
    tujuh: 7,
    delapan: 8,
    sembilan: 9,
  };

  const komaJuta = lower.match(
    /\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)\s+koma\s+(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)\s*juta\b/i
  );
  if (komaJuta) {
    const d1 = wordToDigit[komaJuta[1]];
    const d2 = wordToDigit[komaJuta[2]];
    if (d1 !== undefined && d2 !== undefined) return (d1 * 10 + d2) * 100_000;
  }

  const jutaRatus = lower.match(
    /\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|se)\s*juta\s+(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)\s*ratus(?:\s*ribu)?\b/i
  );
  if (jutaRatus) {
    const d1 = jutaRatus[1] === "se" ? 1 : wordToDigit[jutaRatus[1]];
    const d2 = wordToDigit[jutaRatus[2]];
    if (d1 !== undefined && d2 !== undefined) return d1 * 1_000_000 + d2 * 100_000;
  }

  const ratusRibu = lower.match(
    /\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|se)\s*ratus\s*ribu\b/i
  );
  if (ratusRibu) {
    const d1 = ratusRibu[1] === "se" ? 1 : wordToDigit[ratusRibu[1]];
    if (d1 !== undefined) return d1 * 100_000;
  }

  const ratusPuluhRibu = lower.match(
    /\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|se)\s*ratus\s+(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)?\s*puluh(?:\s+(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan))?\s*ribu\b/i
  );
  if (ratusPuluhRibu) {
    const d1 = ratusPuluhRibu[1] === "se" ? 1 : wordToDigit[ratusPuluhRibu[1]];
    const d2 = ratusPuluhRibu[2] ? wordToDigit[ratusPuluhRibu[2]] : 0;
    const d3 = ratusPuluhRibu[3] ? wordToDigit[ratusPuluhRibu[3]] : 0;
    if (d1 !== undefined) return d1 * 100_000 + d2 * 10_000 + d3 * 1_000;
  }

  if (/\bsetengah\s*juta\b/i.test(lower)) return 500_000;
  if (/\bsejuta\b/i.test(lower) && !/\bukan\s+sejuta\b/i.test(lower)) return 1_000_000;

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
  // If the conversation already has an assistant response actively evaluating the specific action
  const hasPriorEvaluation = chatHistory.some(
    (m) =>
      m.role === "assistant" &&
      (m.content.includes("Setelah pembelian laptop") ||
        m.content.includes("Setelah penyisihan tabungan") ||
        m.content.includes("pembelian laptop Rp 7.000.000") ||
        m.content.includes("skema cicilan 12 bulan laptop"))
  );
  if (hasPriorEvaluation) return true;

  const userTexts = chatHistory
    .filter((m) => m.role === "user")
    .map((m) => m.content.toLowerCase())
    .join(" ");

  if (!userTexts.trim()) return false;

  // 1. Check if user asked about the impact / consequence of purchasing or saving action
  if (
    /(?:apa dampaknya|bagaimana dampaknya|pengaruhnya terhadap|konsekuensi|dampak finansial|akibatnya terhadap).*(?:membeli|beli|laptop|tabung|nabung|tindakan|transaksi)/i.test(
      userTexts
    )
  ) {
    return true;
  }

  // 2. Check if user mentioned the specific target category / item or purchase intent
  if (action.type === "spending") {
    // Check for explicit item keywords
    if (/(?:laptop|komputer|notebook|macbook|pc\b|gadget|perangkat)/i.test(userTexts)) {
      return true;
    }
    // Check for explicit purchase intent or payment options for purchasing
    if (/(?:beli tunai|bayar tunai|mau beli|ingin beli|rencana beli|pembelian seharga|beli seharga|beli cash|cicil laptop|cicilan laptop)/i.test(userTexts)) {
      return true;
    }
    // Check for mention of action amount in buying context (e.g. "7 juta tunai", "beli 7jt")
    if (/(?:beli|bayar|seharga|promo|harga)\s+(?:rp\.?\s*)?7\s*(?:juta|jt|\.000\.000)/i.test(userTexts)) {
      return true;
    }
  } else if (action.type === "saving") {
    // For saving, user must express intent to save / deposit / allocate new money
    if (
      /(?:mau nabung|ingin nabung|rencana nabung|menabung|nabung|tambah tabungan|menambah tabungan|setor tabungan|sisihkan.*untuk tabungan|menyetor|simpan uang|deposito)/i.test(
        userTexts
      )
    ) {
      return true;
    }
    // Explicit mention of saving action amounts (e.g. "sisihkan 2 juta", "nabung 2jt", "tabung 1jt")
    if (/(?:sisihkan|tabung|nabung|setor)\s+(?:rp\.?\s*)?(?:1|2)\s*(?:juta|jt)/i.test(userTexts)) {
      return true;
    }
  }

  return false;
}
