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
