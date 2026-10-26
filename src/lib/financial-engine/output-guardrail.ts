import { StructuredContextPacket } from "./types";
import { sanitizeAmount } from "./validator";

export interface OutputValidationResult {
  isValid: boolean;
  violations: string[];
  metrics: {
    forbiddenTermsDetected: string[];
    contradictorySafetyClaims: boolean;
    contradictoryBudgetCliams: boolean;
    ungroundedAmounts: number[];
  };
}

/**
 * Forbidden internal experiment and research tokens that must NEVER appear in assistant responses.
 */
const FORBIDDEN_RESEARCH_TERMS = [
  "mac",
  "manipulation check",
  "hipotesis",
  "synthetic profile",
  "syntheticprofile",
  "profil sintetis",
  "kondisi kontrol",
  "kondisi eksperimen",
  "jawaban ideal",
  "kuesioner",
  "peserta penelitian",
  "responden",
  "skenario penelitian",
];

/**
 * Extracts Rupiah amounts mentioned in the text.
 * Matches patterns like "Rp 7.000.000", "Rp 7jt", "7 juta", "14.000.000".
 */
export function extractMentionedAmounts(text: string): number[] {
  const amounts: number[] = [];
  const regex = /(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb|k|\.000\.000|\.000)?/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[0].trim();
    // Exclude very small numbers like "1", "2", "3" if no currency context
    if (/^\d{1,2}$/.test(raw)) continue;
    const sanitized = sanitizeAmount(raw);
    if (sanitized && sanitized >= 1000) {
      if (!amounts.includes(sanitized)) {
        amounts.push(sanitized);
      }
    }
  }

  return amounts;
}

/**
 * Collects all allowed/grounded numeric amounts from the context packet.
 */
function getAllowedAmounts(contextPacket: StructuredContextPacket): Set<number> {
  const allowed = new Set<number>();
  const { action, calculation, availableProfile } = contextPacket;

  // Action amount
  allowed.add(action.amount);

  // Calculation figures
  if (calculation.initialBalance !== null) allowed.add(calculation.initialBalance);
  if (calculation.balanceAfterAction !== null) allowed.add(Math.abs(calculation.balanceAfterAction));
  if (calculation.budgetVariance !== null) allowed.add(Math.abs(calculation.budgetVariance));
  if (calculation.deficitAmount > 0) allowed.add(calculation.deficitAmount);
  if (calculation.totalLiabilitiesBeforeIncome > 0) allowed.add(calculation.totalLiabilitiesBeforeIncome);
  if (calculation.totalLiabilitiesAfterIncome > 0) allowed.add(calculation.totalLiabilitiesAfterIncome);
  if (calculation.remainingCashAfterImmediateObligations !== null) {
    allowed.add(Math.abs(calculation.remainingCashAfterImmediateObligations));
  }

  // Budget
  if (calculation.relevantBudget) {
    allowed.add(calculation.relevantBudget.allocated);
    allowed.add(calculation.relevantBudget.remaining);
    allowed.add(calculation.relevantBudget.spentSoFar);
  }

  // Liabilities
  for (const l of calculation.liabilitiesDueBeforeIncome) allowed.add(l.amount);
  for (const l of calculation.liabilitiesDueAfterIncome) allowed.add(l.amount);

  // Buffer
  if (calculation.bufferImpact.minBuffer !== null) allowed.add(calculation.bufferImpact.minBuffer);
  if (calculation.bufferImpact.projectedBufferRemaining !== null) {
    allowed.add(calculation.bufferImpact.projectedBufferRemaining);
  }

  // Profile if present
  if (availableProfile?.totalCashBalance) allowed.add(availableProfile.totalCashBalance);
  if (availableProfile?.liquidBalance) allowed.add(availableProfile.liquidBalance);
  if (availableProfile?.budgets) {
    for (const b of availableProfile.budgets) {
      allowed.add(b.allocated);
      allowed.add(b.remaining);
    }
  }
  if (availableProfile?.goals) {
    for (const g of availableProfile.goals) {
      allowed.add(g.targetAmount);
      allowed.add(g.currentAllocated);
    }
  }

  // User provided finances
  if (availableProfile?.userProvidedFinances) {
    const uf = availableProfile.userProvidedFinances;
    if (uf.balance) allowed.add(uf.balance);
    if (uf.budget) allowed.add(uf.budget);
    if (uf.income) allowed.add(uf.income);
    if (uf.liabilities) allowed.add(uf.liabilities);
  }

  return allowed;
}

/**
 * Validates the assistant's generated output against deterministic financial calculation facts,
 * consistency constraints, and research isolation boundaries.
 */
export function validateAssistantOutput(
  content: string,
  contextPacket: StructuredContextPacket
): OutputValidationResult {
  const violations: string[] = [];
  const lower = content.toLowerCase();

  // 1. Check for forbidden research terms
  const detectedTerms: string[] = [];
  for (const term of FORBIDDEN_RESEARCH_TERMS) {
    if (lower.includes(term)) {
      detectedTerms.push(term);
      violations.push(`Teks mengandung istilah penelitian terlarang: "${term}".`);
    }
  }

  // 2. Check Safety Claim Consistency
  // If liquidity is threatened or buffer breached, assistant MUST NOT claim it is unconditionally safe.
  let contradictorySafetyClaims = false;
  const claimsSafe =
    /(sangat aman|secara finansial aman|dapat dipastikan tetap terpenuhi|masih sangat cukup|tidak ada risiko|tanpa kendala|tidak perlu khawatir)/i.test(
      content
    );
  if (
    (contextPacket.calculation.isLiquidityThreatened ||
      contextPacket.calculation.isBufferMaintained === false ||
      contextPacket.calculation.canCoverObligations === false) &&
    claimsSafe
  ) {
    contradictorySafetyClaims = true;
    violations.push(
      "Klaim keamanan berkontradiksi: Menyebut 'aman', 'pasti terpenuhi', atau 'tanpa risiko' padahal terjadi potensi defisit atau batas buffer dana darurat tergerus."
    );
  }

  // Check unwarranted essential expenses certainty:
  if (
    contextPacket.calculation.canCoverEssentialExpenses === "unknown" &&
    /(kebutuhan (?:harian|rutin) (?:pasti|dapat dipastikan) (?:aman|terpenuhi))/i.test(content)
  ) {
    violations.push(
      "Klaim kebutuhan harian terlalu pasti: Mengklaim kebutuhan harian pasti aman padahal nominal kebutuhan harian belum tercatat secara definitif."
    );
  }

  // 3. Check Budget Claim Consistency
  // If budget is exceeded, assistant cannot claim within budget
  let contradictoryBudgetCliams = false;
  const claimsWithinBudget =
    /(masih dalam batas anggaran|anggaran mencukupi|tidak melebihi anggaran)/i.test(content);
  if (contextPacket.calculation.isBudgetExceeded && claimsWithinBudget) {
    contradictoryBudgetCliams = true;
    violations.push(
      "Klaim anggaran berkontradiksi: Menyebut 'dalam batas anggaran' padahal anggaran terlampaui."
    );
  }

  // 4. Check Basic Condition Data Completeness
  // If Basic and no user finances provided, assistant must not claim a specific remaining balance
  if (
    contextPacket.condition === "basic" &&
    contextPacket.calculation.status === "needs_clarification"
  ) {
    const claimsSpecificBalance =
      /(saldo (?:anda|tersisa|menjadi|anda tersisa|anda menjadi) (?:sebesar )?rp)/i.test(content);
    if (claimsSpecificBalance) {
      violations.push(
        "Kondisi Basic tanpa data: Asisten mengklaim saldo spesifik padahal data saldo belum disediakan pengguna."
      );
    }
  }

  // 5. Check Grounding of Large Currency Amounts
  const allowedAmounts = getAllowedAmounts(contextPacket);
  const mentioned = extractMentionedAmounts(content);
  const ungroundedAmounts: number[] = [];

  for (const amt of mentioned) {
    // Only check substantial numbers (>= 100.000) to avoid false positives on small units
    if (amt >= 100000) {
      let isAllowed = false;
      for (const a of allowedAmounts) {
        if (Math.abs(a - amt) === 0) {
          isAllowed = true;
          break;
        }
      }
      if (!isAllowed) {
        ungroundedAmounts.push(amt);
      }
    }
  }

  if (ungroundedAmounts.length > 0) {
    violations.push(
      `Terdapat angka nominal yang tidak berdasar pada data fakta terverifikasi: [${ungroundedAmounts
        .map((a) => `Rp ${a.toLocaleString("id-ID")}`)
        .join(", ")}].`
    );
  }

  const isValid = violations.length === 0;

  return {
    isValid,
    violations,
    metrics: {
      forbiddenTermsDetected: detectedTerms,
      contradictorySafetyClaims,
      contradictoryBudgetCliams,
      ungroundedAmounts,
    },
  };
}
