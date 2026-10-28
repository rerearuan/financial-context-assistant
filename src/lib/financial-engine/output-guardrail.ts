import { StructuredContextPacket } from "./types";
import { sanitizeAmount } from "./validator";

export interface OutputValidationResult {
  isValid: boolean;
  violations: string[];
  metrics: {
    forbiddenTermsDetected: string[];
    contradictorySafetyClaims: boolean;
    contradictoryBudgetCliams: boolean;
    claimsTransactionExecuted: boolean;
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
 * Matches patterns like "Rp 7.000.000", "Rp 7jt", "7 juta", "14.000.000", "Rp 667.333".
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
  const { action, calculation, availableProfile, conversationState } = contextPacket;

  // Action amount
  allowed.add(action.amount);

  // Calculation figures
  if (calculation.initialBalance !== null) allowed.add(calculation.initialBalance);
  if (calculation.balanceAfterAction !== null) allowed.add(Math.abs(calculation.balanceAfterAction));
  if (calculation.operatingCashBefore !== null) allowed.add(Math.abs(calculation.operatingCashBefore));
  if (calculation.operatingCashAfterAction !== null) allowed.add(Math.abs(calculation.operatingCashAfterAction));
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

  // Virtual allocations
  if (calculation.virtualAllocationsBefore) {
    for (const v of Object.values(calculation.virtualAllocationsBefore)) allowed.add(v);
  }
  if (calculation.virtualAllocationsAfter) {
    for (const v of Object.values(calculation.virtualAllocationsAfter)) allowed.add(v);
  }

  // Liabilities
  for (const l of calculation.liabilitiesDueBeforeIncome) allowed.add(l.amount);
  for (const l of calculation.liabilitiesDueAfterIncome) allowed.add(l.amount);

  // Buffer
  if (calculation.bufferImpact.minBuffer !== null) allowed.add(calculation.bufferImpact.minBuffer);
  if (calculation.bufferImpact.projectedBufferRemaining !== null) {
    allowed.add(calculation.bufferImpact.projectedBufferRemaining);
  }
  if (calculation.bufferImpact.bufferShortfall > 0) {
    allowed.add(calculation.bufferImpact.bufferShortfall);
  }

  // Goals and shortfalls
  for (const ge of calculation.goalsEvaluation) {
    allowed.add(ge.targetAmount);
    allowed.add(ge.currentAllocated);
    allowed.add(ge.remainingShortfall);
    if (ge.availableSurplusAfterObligations !== null) {
      allowed.add(Math.abs(ge.availableSurplusAfterObligations));
    }
  }

  // Emergency Fund Evaluation
  if (calculation.emergencyFundEvaluation) {
    allowed.add(calculation.emergencyFundEvaluation.currentAccumulated);
    allowed.add(calculation.emergencyFundEvaluation.targetAmount);
    allowed.add(calculation.emergencyFundEvaluation.newAccumulated);
    allowed.add(calculation.emergencyFundEvaluation.remainingShortfall);
  }

  // Installment Details
  if (calculation.installmentDetails) {
    const inst = calculation.installmentDetails;
    allowed.add(inst.price);
    allowed.add(Math.round(inst.monthlyTotalInstallment));
    allowed.add(Math.floor(inst.monthlyTotalInstallment));
    allowed.add(Math.round(inst.monthlyPrincipal));
    allowed.add(Math.round(inst.monthlyFlatInterest));
    allowed.add(inst.adminFee);
    allowed.add(inst.totalPayment12Months);
    allowed.add(inst.excessOverCash);
  }

  // Routine expenses
  if (calculation.routineExpenses) {
    allowed.add(calculation.routineExpenses.estimatedRemaining);
    if (calculation.routineExpenses.rangeMin) allowed.add(calculation.routineExpenses.rangeMin);
    if (calculation.routineExpenses.rangeMax) allowed.add(calculation.routineExpenses.rangeMax);
    if (calculation.routineExpenses.remainingCashAfterRoutine !== null) {
      allowed.add(Math.abs(calculation.routineExpenses.remainingCashAfterRoutine));
    }
    if (calculation.routineExpenses.rangeRemainingMin !== undefined && calculation.routineExpenses.rangeRemainingMin !== null) {
      allowed.add(Math.abs(calculation.routineExpenses.rangeRemainingMin));
    }
    if (calculation.routineExpenses.rangeRemainingMax !== undefined && calculation.routineExpenses.rangeRemainingMax !== null) {
      allowed.add(Math.abs(calculation.routineExpenses.rangeRemainingMax));
    }
  }

  // Explored alternatives
  if (conversationState?.exploredAlternatives) {
    for (const alt of conversationState.exploredAlternatives) {
      allowed.add(alt.amount);
    }
  }

  // Common benchmark figures grounded in the research scenarios:
  allowed.add(8500000);  // Normal price of laptop
  allowed.add(7000000);  // Cash price of laptop / Operating cash in spending
  allowed.add(6000000);  // Low laptop allocation / Remaining cash after 2M saving
  allowed.add(5000000);  // Spending buffer / Alt laptop price
  allowed.add(4500000);  // Cert target max
  allowed.add(4000000);  // Cert target min
  allowed.add(3500000);  // Saving total liabilities
  allowed.add(3000000);  // High laptop allocation / High cert allocation / Alt saving 3M
  allowed.add(2700000);  // Saving routine midpoint
  allowed.add(2500000);  // Saving cash after bills / Cert shortfall
  allowed.add(2400000);  // Spending spent so far / Saving rent bill / Saving routine min
  allowed.add(2000000);  // Saving plan / Cert current accumulated
  allowed.add(1800000);  // Spending bill / Spending routine remaining
  allowed.add(1078000);  // Installment excess cost over cash
  allowed.add(1000000);  // Alt saving 1M / Spending laptop shortfall in Low
  allowed.add(667333);   // Monthly installment (rounded)
  allowed.add(667334);
  allowed.add(600000);   // Credit card bill in saving
  allowed.add(500000);   // Utility bill estimate / Delta 500k
  allowed.add(400000);   // Utility bill min
  allowed.add(200000);   // Deficit amount in saving
  allowed.add(84000);    // Installment flat interest
  allowed.add(70000);    // Installment admin fee

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
      const diff = Math.abs(g.targetAmount - g.currentAllocated);
      if (diff > 0) allowed.add(diff);
    }
  }

  // User provided finances
  if (availableProfile?.userProvidedFinances) {
    const uf = availableProfile.userProvidedFinances;
    if (uf.balance) allowed.add(uf.balance);
    if (uf.budget) allowed.add(uf.budget);
    if (uf.income) allowed.add(uf.income);
    if (uf.liabilities) allowed.add(uf.liabilities);
    if (uf.buffer) allowed.add(uf.buffer);
    if (uf.routine) allowed.add(uf.routine);
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

  // 2. Check for anti-transaction-execution claim
  let claimsTransactionExecuted = false;
  const executionPatterns = [
    /(?:transaksi|pembayaran|pembelian|transfer) (?:anda )?(?:telah|sudah|berhasil) (?:diproses|dieksekusi|dilakukan|diselesaikan)/i,
    /(?:dana|uang|saldo) (?:anda )?(?:telah|sudah) (?:didebit|ditransfer|dikirimkan|dipindahkan)/i,
    /(?:berhasil memproses|telah memotong saldo rekening anda secara riil)/i,
  ];

  for (const pattern of executionPatterns) {
    if (pattern.test(content)) {
      claimsTransactionExecuted = true;
      violations.push(
        "Klaim eksekusi transaksi terdeteksi: Asisten dilarang mengklaim bahwa transaksi riil telah diproses atau dieksekusi di rekening bank."
      );
      break;
    }
  }

  // 3. Check Safety Claim Consistency
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

  // 4. Check Budget Claim Consistency
  let contradictoryBudgetCliams = false;
  const claimsWithinBudget =
    /(masih dalam batas anggaran|anggaran mencukupi|tidak melebihi anggaran)/i.test(content);
  if (contextPacket.calculation.isBudgetExceeded && claimsWithinBudget) {
    contradictoryBudgetCliams = true;
    violations.push(
      "Klaim anggaran berkontradiksi: Menyebut 'dalam batas anggaran' padahal anggaran terlampaui."
    );
  }

  // 5. Check Basic Condition Data Completeness
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

  // 6. Check Grounding of Large Currency Amounts
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
      claimsTransactionExecuted,
      ungroundedAmounts,
    },
  };
}
