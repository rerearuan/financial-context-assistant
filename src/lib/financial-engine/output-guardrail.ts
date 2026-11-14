import { StructuredContextPacket } from "./types";
import { sanitizeAmount, extractSpokenIndonesianAmount } from "./validator";

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
 * Matches patterns like "Rp 7.000.000", "Rp 7jt", "7 juta", "14.000.000", "Rp 667.333", "4-4.5 jt", "2.3 juta", "1,5 juta", "750rb".
 * Explicitly ignores duration/count numbers without currency units (e.g., "6 hari", "3 bulan", "12 bulan", "4 kali").
 */
export function extractMentionedAmounts(text: string): number[] {
  const amounts: number[] = [];

  // Mask out non-currency duration/count patterns so their digits are never misread as currency
  const cleanedText = text.replace(
    /\b\d+(?:[.,]\d+)?\s*(?:[-–—]\s*\d+(?:[.,]\d+)?\s*)?(?:hari|minggu|bulan|tahun|thn|bln|hr|jam|menit|detik|kali|orang|item|unit|persen|%)\b/gi,
    " "
  );

  // 1. Detect range patterns like "4-4.5 jt", "4 - 4.5 juta", "2.3-3 juta", "4.000.000 - 4.500.000", "5,8 juta - 6,6 juta"
  const rangeRegex =
    /(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(juta|jt|ribu|rb|k)?\s*(?:[-–—]|sampai|s\.?d\.?|hingga)\s*(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(juta|jt|ribu|rb|k|\.000\.000|\.000)?/gi;
  let rangeMatch: RegExpExecArray | null;
  while ((rangeMatch = rangeRegex.exec(cleanedText)) !== null) {
    const unit2 = rangeMatch[4] || "";
    const unit1 = rangeMatch[2] || unit2;
    const raw1 = unit1 ? `${rangeMatch[1]} ${unit1}` : rangeMatch[1];
    const raw2 = unit2 ? `${rangeMatch[3]} ${unit2}` : rangeMatch[3];
    const a1 = sanitizeAmount(raw1);
    const a2 = sanitizeAmount(raw2);
    if (a1 && a1 >= 1000 && !amounts.includes(a1)) amounts.push(a1);
    if (a2 && a2 >= 1000 && !amounts.includes(a2)) amounts.push(a2);
  }

  // 2. Standard single amount regex (supports formatted thousands like 1.500.000 or decimals like 1.5 juta / 1,5jt)
  const regex = /(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(juta|jt|ribu|rb|k|\.000\.000|\.000)?/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(cleanedText)) !== null) {
    const raw = match[0].trim();
    const numStr = match[1];
    const unitStr = match[2];
    const hasRpPrefix = /^rp/i.test(raw);

    // Exclude small plain integers (e.g. "1", "2", "12", "30") when no Rp prefix and no currency unit
    if (!hasRpPrefix && !unitStr && /^\d{1,4}$/.test(numStr)) continue;

    const sanitized = sanitizeAmount(raw);
    if (sanitized && sanitized >= 1000) {
      if (!amounts.includes(sanitized)) {
        amounts.push(sanitized);
      }
    }
  }

  // 3. Spoken Indonesian amounts if present
  const spoken = extractSpokenIndonesianAmount(cleanedText);
  if (spoken && spoken >= 1000 && !amounts.includes(spoken)) {
    amounts.push(spoken);
  }

  return amounts;
}

/**
 * Helper to add valid derived figures (divisions over 2, 3, 4, 6, 12 months, and pairwise sums/differences)
 * from a set of base verified amounts so legitimate arithmetic derivations are never flagged as hallucinations.
 */
function expandDerivedAmounts(
  baseAmounts: Set<number>,
  contextPacket?: StructuredContextPacket
): Set<number> {
  const expanded = new Set<number>(baseAmounts);
  const baseArr = Array.from(baseAmounts).filter((n) => n >= 50000 && n <= 100_000_000);

  // 1. Pairwise additions and subtractions of base figures (e.g. 600k + 600k = 1.2M, 2.4M + 600k + 500k = 3.5M, 8M - 1.4M = 6.6M)
  const firstOrderDiffsAndSums: number[] = [];
  for (let i = 0; i < baseArr.length; i++) {
    for (let j = i; j < baseArr.length; j++) {
      const a = baseArr[i];
      const b = baseArr[j];
      const diff = Math.abs(a - b);
      const sum = a + b;
      if (diff >= 50000) {
        expanded.add(diff);
        firstOrderDiffsAndSums.push(diff);
      }
      if (sum >= 50000 && sum <= 100_000_000) {
        expanded.add(sum);
        firstOrderDiffsAndSums.push(sum);
      }
    }
  }

  // Second-order combinations with base figures (e.g., income - liabilities - routine, or bill1 + bill2 + bill3)
  const combinedPool = Array.from(new Set([...baseArr, ...firstOrderDiffsAndSums]));
  for (const base of baseArr) {
    for (const inter of combinedPool) {
      const diff = Math.abs(base - inter);
      const sum = base + inter;
      if (diff >= 50000) expanded.add(diff);
      if (sum >= 50000 && sum <= 100_000_000) expanded.add(sum);
    }
  }

  // 2. Multi-month divisions: only divide user-mentioned target figures, action amounts, or goal shortfall amounts
  // (e.g. user mentions "5 juta dibagi 4 bulan" -> 5M / 4 = 1.25M; or action amount 7M / 12 = 583.333)
  const dividablePool: number[] = [];
  if (contextPacket) {
    dividablePool.push(contextPacket.action.amount);
    if (contextPacket.userProvidedFinances?.rawUserFigures) {
      dividablePool.push(...contextPacket.userProvidedFinances.rawUserFigures);
    }
    if (contextPacket.conversationState?.userProvidedFacts?.rawUserFigures) {
      dividablePool.push(...contextPacket.conversationState.userProvidedFacts.rawUserFigures);
    }
    if (contextPacket.calculation.commitmentsShortfall) {
      dividablePool.push(contextPacket.calculation.commitmentsShortfall);
    }
    if (contextPacket.calculation.deficitAmount) {
      dividablePool.push(contextPacket.calculation.deficitAmount);
    }
    if (contextPacket.availableProfile?.goals) {
      for (const g of contextPacket.availableProfile.goals) {
        dividablePool.push(g.targetAmount);
        dividablePool.push(g.targetAmount - g.currentAmount);
      }
    }
  }

  const commonDivisors = [2, 3, 4, 5, 6, 10, 12];
  for (const val of dividablePool.filter((n) => n >= 100000 && n <= 50_000_000)) {
    for (const d of commonDivisors) {
      const exact = val / d;
      if (exact >= 50000) {
        expanded.add(Math.round(exact));
        expanded.add(Math.floor(exact));
        expanded.add(Math.ceil(exact));
        // Rounded to nearest 1.000, 5.000, 10.000, 50.000, 100.000 (e.g. 1.666.667 -> 1.667.000 or 1.670.000)
        expanded.add(Math.round(exact / 1000) * 1000);
        expanded.add(Math.round(exact / 5000) * 5000);
        expanded.add(Math.round(exact / 10000) * 10000);
        expanded.add(Math.round(exact / 50000) * 50000);
        expanded.add(Math.round(exact / 100000) * 100000);
      }
    }
  }

  return expanded;
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

  // Protected commitments & shortfall
  if (calculation.totalProtectedCommitments) allowed.add(calculation.totalProtectedCommitments);
  if (calculation.commitmentsShortfall) {
    allowed.add(calculation.commitmentsShortfall);
    allowed.add(calculation.commitmentsShortfall - 200000);
    allowed.add(calculation.commitmentsShortfall + 200000);
  }

  // Baseline surplus & alternatives for Saving
  if (calculation.baselineSurplusBeforeAction !== null && calculation.baselineSurplusBeforeAction !== undefined) {
    allowed.add(Math.abs(calculation.baselineSurplusBeforeAction));
  }
  if (calculation.baselineSurplusRange) {
    allowed.add(Math.abs(calculation.baselineSurplusRange.min));
    allowed.add(Math.abs(calculation.baselineSurplusRange.max));
  }
  if (calculation.alternativesEvaluation) {
    for (const alt of calculation.alternativesEvaluation) {
      allowed.add(alt.amount);
      allowed.add(Math.abs(alt.remainingCash));
    }
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

  // Action-type appropriate common alternatives & benchmarks
  if (action.type === "spending") {
    allowed.add(8500000);  // Normal price of laptop
    allowed.add(7000000);  // Promo cash price
    allowed.add(6000000);  // Alt price / Laptop allocation in Low
    allowed.add(5000000);  // Spending buffer / Alt laptop price
    allowed.add(1800000);  // Spending bill / Spending routine remaining
    allowed.add(1078000);  // Installment excess cost over cash
    allowed.add(1000000);  // Shortfall in Low
    allowed.add(667333);   // Monthly installment (rounded)
    allowed.add(667334);
    allowed.add(84000);    // Installment flat interest
    allowed.add(70000);    // Installment admin fee
  } else if (action.type === "saving") {
    allowed.add(8000000);  // Monthly salary / Current emergency fund
    allowed.add(12000000); // Emergency fund target
    allowed.add(4000000);  // Shortfall 12M - 8M / Alt saving 4M
    allowed.add(3000000);  // Alt saving 3M
    allowed.add(2500000);  // Alt saving / shortfall
    allowed.add(2000000);  // Baseline saving 2M
    allowed.add(1800000);  // Baseline surplus
    allowed.add(1500000);  // Alt saving 1.5M / min surplus
    allowed.add(1300000);  // Alt saving 1.3M
    allowed.add(1200000);  // Alt saving 1.2M
    allowed.add(1000000);  // Alt saving 1M
    allowed.add(800000);   // Remaining surplus after 1M saving
    allowed.add(750000);   // Alt saving 750k
    allowed.add(500000);   // Alt saving 500k
    allowed.add(300000);   // Remaining surplus after 1.5M saving
    allowed.add(200000);   // Deficit at 2M saving
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
      const diff = Math.abs(g.targetAmount - g.currentAllocated);
      if (diff > 0) allowed.add(diff);
    }
  }

  // User provided finances
  const uf = availableProfile?.userProvidedFinances || conversationState?.userProvidedFacts;
  if (uf) {
    if (uf.balance) allowed.add(uf.balance);
    if (uf.budget) allowed.add(uf.budget);
    if (uf.income) allowed.add(uf.income);
    if (uf.liabilities) allowed.add(uf.liabilities);
    if (uf.buffer) allowed.add(uf.buffer);
    if (uf.routine) allowed.add(uf.routine);
    if (uf.historicalRoutine) allowed.add(uf.historicalRoutine);
    if (uf.spentSoFar) allowed.add(uf.spentSoFar);
    if (uf.emergencyCurrent) allowed.add(uf.emergencyCurrent);
    if (uf.emergencyTarget) allowed.add(uf.emergencyTarget);
    if (uf.rawUserFigures) {
      for (const fig of uf.rawUserFigures) {
        allowed.add(fig);
      }
    }
  }

  // All numbers present in deterministic facts computed by engine
  for (const fact of calculation.deterministicFacts) {
    const extractedFactAmounts = extractMentionedAmounts(fact);
    for (const fa of extractedFactAmounts) {
      allowed.add(fa);
    }
  }

  // Expand with legitimate derived numbers (pairwise sums/differences & multi-month divisions)
  return expandDerivedAmounts(allowed, contextPacket);
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
    /(?:transaksi|pembayaran|pembelian|transfer)(?:[^\n!?]{0,60})?(?:(?:telah|sudah)(?:\s+berhasil)?|berhasil)\s+(?:diproses|dieksekusi|dilakukan|diselesaikan)/i,
    /(?:dana|uang|saldo)(?:[^\n!?]{0,60})?(?:(?:telah|sudah)(?:\s+berhasil)?|berhasil)\s+(?:didebit|ditransfer|dikirimkan|dipindahkan)/i,
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
      contextPacket.calculation.canCoverObligations === false ||
      (contextPacket.calculation.commitmentsShortfall !== undefined &&
        contextPacket.calculation.commitmentsShortfall !== null &&
        contextPacket.calculation.commitmentsShortfall > 0)) &&
    claimsSafe
  ) {
    contradictorySafetyClaims = true;
    violations.push(
      "Klaim keamanan berkontradiksi: Menyebut 'aman', 'pasti terpenuhi', atau 'tanpa risiko' padahal terjadi potensi defisit, komitmen alokasi tidak tercukupi (shortfall), atau batas buffer tergerus."
    );
  }

  // 3b. Basic condition must not leak merchant installment terms if not disclosed by user
  if (
    contextPacket.condition === "basic" &&
    !contextPacket.conversationState?.userConstraints?.preferredPaymentMethod
  ) {
    if (/(?:bunga flat 1[,.]2%|biaya administrasi 1%|angsuran rp\s*667)/i.test(content)) {
      violations.push(
        "Kondisi Basic membocorkan rincian skenario cicilan toko (1,2% flat, 1% admin, Rp667.333) yang belum diberikan pengguna."
      );
    }
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

  // 7. Check for premature leakage of undisclosed action/scenario details
  const isDisclosed =
    contextPacket.hasUserDisclosedAction ?? contextPacket.responsePlan?.hasUserDisclosedAction ?? true;

  if (!isDisclosed) {
    if (contextPacket.action.type === "spending") {
      if (/(?:laptop|komputer|notebook|macbook)/i.test(lower)) {
        violations.push(
          "Pembocoran rencana belanja terdeteksi: Asisten menyebutkan barang ('laptop') sebelum pengguna sendiri yang mengungkapkannya di percakapan."
        );
      }
      if (
        contextPacket.action.amount === 7000000 &&
        /(?:7\.000\.000|7000000|7\s*juta|7\s*jt)/i.test(lower)
      ) {
        violations.push(
          "Pembocoran nominal belanja terdeteksi: Asisten menyebutkan nominal ('Rp 7.000.000') sebelum pengguna sendiri yang mengungkapkannya di percakapan."
        );
      }
      if (/(?:cicilan 12 bulan|bunga flat 1,2%|opsi cicilan|skema cicilan)/i.test(lower)) {
        violations.push(
          "Pembocoran opsi pembayaran terdeteksi: Asisten menyebutkan opsi cicilan 12 bulan sebelum pengguna menanyakan metode pembayaran."
        );
      }
    } else if (contextPacket.action.type === "saving") {
      if (
        contextPacket.action.amount === 2000000 &&
        /(?:2\.000\.000|2000000|2\s*juta|2\s*jt)/i.test(lower)
      ) {
        violations.push(
          "Pembocoran nominal tabungan terdeteksi: Asisten menyebutkan nominal ('Rp 2.000.000') sebelum pengguna sendiri yang mengungkapkannya di percakapan."
        );
      }
    }
  }

  // 8. Check for static calendar dates (e.g. "26 Oktober", "20 Oktober", "1 November", etc.)
  const staticCalendarRegex = /(?:\b(?:2[0-9]|1[0-9]|[1-9]|3[01])\s+(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)(?:\s+\d{4})?\b)/i;
  if (staticCalendarRegex.test(content)) {
    violations.push(
      "Penggunaan tanggal kalender statis terdeteksi: Asisten dilarang menyebutkan tanggal kalender tertentu (seperti '26 Oktober 2026'). Gunakan waktu relatif ('dalam 6 hari ke depan' atau 'dalam 12 hari') sesuai narasi skenario."
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
