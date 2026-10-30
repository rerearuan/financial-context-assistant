import {
  AssessmentStatus,
  FinancialAction,
  FinancialCalculationResult,
  FinancialProfileContext,
  GoalAllocationCalculation,
  InstallmentCalculation,
  UserConstraints,
  UserProvidedFinances,
} from "./types";
import { selectRelevantFinancialContext } from "./relevant-selector";

/**
 * Calculate exact installment figures according to research instrument specifications:
 * - Tenor 12 bulan
 * - Bunga flat 1,2% per bulan dari harga barang
 * - Biaya administrasi 1% dari harga barang
 */
export function calculateInstallmentDetails(price: number = 7000000): InstallmentCalculation {
  const tenorMonths = 12;
  const monthlyPrincipal = Math.round((price / tenorMonths) * 100) / 100; // 583.333,33
  const monthlyFlatInterest = Math.round(price * 0.012); // 84.000
  const monthlyTotalInstallment = Math.round((monthlyPrincipal + monthlyFlatInterest) * 100) / 100; // 667.333,33
  const adminFee = Math.round(price * 0.01); // 70.000
  const totalPayment12Months = Math.round(monthlyTotalInstallment * 12 + adminFee); // 8.078.000
  const excessOverCash = totalPayment12Months - price; // 1.078.000

  return {
    price,
    tenorMonths,
    monthlyPrincipal,
    monthlyFlatInterest,
    monthlyTotalInstallment,
    adminFee,
    totalPayment12Months,
    excessOverCash,
    knownFirstDueDate: null, // Asumsi instrumen: jadwal pembayaran pertama belum diketahui
    knownAdminDueDate: null, // Waktu pembayaran admin belum ditentukan
  };
}

/**
 * Deterministic Financial Calculator
 * Single source of truth for arithmetic, horizon mapping, mental accounting partitions,
 * and multi-dimensional feasibility checks.
 */
export function calculateFinancialConsequences(
  action: FinancialAction,
  profile?: FinancialProfileContext | null,
  userProvidedOrConstraints?: UserProvidedFinances | UserConstraints | null,
  constraintsParam?: UserConstraints | null
): FinancialCalculationResult {
  let userProvided: UserProvidedFinances | null = null;
  let constraints: UserConstraints | null = constraintsParam ?? null;

  if (userProvidedOrConstraints) {
    if (
      "prohibitCertificationFunds" in userProvidedOrConstraints ||
      "maintainBufferAmount" in userProvidedOrConstraints
    ) {
      constraints = userProvidedOrConstraints as UserConstraints;
    } else {
      userProvided = userProvidedOrConstraints as UserProvidedFinances;
    }
  }
  // =========================================================================
  // Case A: Context-Aware (Synthetic Profile available)
  // =========================================================================
  if (profile) {
    const selected = selectRelevantFinancialContext(profile, action);
    const initialBalance = profile.totalCashBalance;
    const isSaving = action.type === "saving";
    const isSpending = action.type === "spending";

    // 1. Bank Cash Balance vs Virtual Allocations
    // Rule: Spending sends money outside -> bank cash decreases.
    // Saving re-allocates inside the same account -> total bank cash is unchanged.
    const netCashFlowImpact = isSpending ? action.amount : 0;
    const balanceAfterAction = initialBalance - netCashFlowImpact;
    const canPayAction: AssessmentStatus = initialBalance >= netCashFlowImpact;

    // Virtual allocations before and after
    const virtualAllocationsBefore: Record<string, number> = {
      ...(profile.allocations || {}),
    };
    const virtualAllocationsAfter: Record<string, number> = {
      ...virtualAllocationsBefore,
    };

    let budgetVariance: number | null = null;
    let isBudgetExceeded = false;
    let budgetShortfallCoverSource: FinancialCalculationResult["budgetShortfallCoverSource"] = undefined;
    let operatingCashBefore: number | null = null;
    let operatingCashAfterAction: number | null = null;

    if (isSpending) {
      // Spending scenario (Laptop)
      const designatedAlloc = virtualAllocationsBefore["laptop"] ?? 0;
      operatingCashBefore = virtualAllocationsBefore["operating"] ?? 7000000;
      budgetVariance = designatedAlloc - action.amount;
      isBudgetExceeded = budgetVariance < 0;

      if (isBudgetExceeded) {
        const shortfall = Math.abs(budgetVariance);
        // By default or by explicit constraint, do NOT touch certification funds unless user asks
        const protectCert = constraints?.prohibitCertificationFunds !== false;
        
        if (protectCert) {
          // Deduct shortfall purely from operating cash
          operatingCashAfterAction = operatingCashBefore - shortfall;
          virtualAllocationsAfter["laptop"] = 0;
          virtualAllocationsAfter["operating"] = operatingCashAfterAction;
          budgetShortfallCoverSource = "operating_cash";
        } else {
          // Allow certification funds to be touched if explicitly allowed
          operatingCashAfterAction = operatingCashBefore;
          budgetShortfallCoverSource = "certification_funds";
        }
      } else {
        virtualAllocationsAfter["laptop"] = designatedAlloc - action.amount;
        operatingCashAfterAction = operatingCashBefore;
      }
    } else {
      // Saving scenario (Emergency Fund Allocation)
      // New monthly income = 8jt is in operating cash.
      operatingCashBefore = virtualAllocationsBefore["operating"] ?? 8000000;
      operatingCashAfterAction = operatingCashBefore - action.amount;
      
      const emergencyBefore = virtualAllocationsBefore["emergency"] ?? 8000000;
      const emergencyAfter = emergencyBefore + action.amount;
      virtualAllocationsAfter["emergency"] = emergencyAfter;
      virtualAllocationsAfter["operating"] = operatingCashAfterAction;
      
      budgetVariance = operatingCashAfterAction; // Remaining operating income
      isBudgetExceeded = operatingCashAfterAction < 0;
    }

    // 2. Liabilities & Horizon
    const totalLiabilitiesBeforeIncome = selected.totalLiabilitiesBeforeIncome;
    const liabilitiesDueBeforeIncome = selected.liabilitiesDueBeforeIncome;
    const liabilitiesDueAfterIncome = selected.liabilitiesDueAfterIncome;
    const totalLiabilitiesAfterIncome = selected.totalLiabilitiesAfterIncome;

    // Remaining operating cash after immediate obligations (due before next income)
    const remainingCashAfterImmediateObligations = isSaving
      ? (operatingCashAfterAction ?? 8000000) - totalLiabilitiesBeforeIncome
      : balanceAfterAction - totalLiabilitiesBeforeIncome;
    const canCoverObligations: AssessmentStatus = remainingCashAfterImmediateObligations >= 0;
    const isLiquidityThreatened = !canCoverObligations;
    const deficitAmount = isLiquidityThreatened
      ? Math.abs(remainingCashAfterImmediateObligations)
      : 0;

    // 3. Buffer Check
    // In spending: buffer is 5M minimum emergency fund that user wants to keep intact in the bank
    const minBuffer = profile.buffer?.minAmount || (isSpending ? 5000000 : 0);
    let isBufferMaintained: AssessmentStatus = true;
    let bufferShortfall = 0;

    if (isSpending) {
      // Buffer of 5M is evaluated against total remaining bank cash after purchase and upcoming bills:
      // Remaining bank cash = 18jt - 7jt - 1.8jt = 9.2jt.
      // Sisa kas operasional bebas di atas buffer (5jt) = 9.2jt - 5jt = 4.2jt (Low) atau 1.2jt (High).
      const totalBankAfterBills = balanceAfterAction - totalLiabilitiesBeforeIncome;
      isBufferMaintained = totalBankAfterBills >= minBuffer;
      bufferShortfall = isBufferMaintained ? 0 : Math.max(0, minBuffer - totalBankAfterBills);
    } else {
      // In saving: buffer is operational cash adequacy (min 0)
      isBufferMaintained = remainingCashAfterImmediateObligations >= 0;
      bufferShortfall = isBufferMaintained ? 0 : Math.abs(remainingCashAfterImmediateObligations);
    }

    // 4. Essential Routine Expenses Evaluation
    let routineResult: FinancialCalculationResult["routineExpenses"] = null;
    let canCoverEssentialExpenses: AssessmentStatus = "unknown";

    if (profile.routineExpenses) {
      const routineMid = profile.routineExpenses.remainingEstimate;
      const rMin = profile.routineExpenses.range?.min ?? routineMid;
      const rMax = profile.routineExpenses.range?.max ?? routineMid;

      // Calculate net cash after routine expenses
      const remainingCashAfterRoutine = remainingCashAfterImmediateObligations - routineMid;
      const rangeRemainingMax = remainingCashAfterImmediateObligations - rMin; // best case (expenses at min)
      const rangeRemainingMin = remainingCashAfterImmediateObligations - rMax; // worst case (expenses at max)

      canCoverEssentialExpenses = remainingCashAfterRoutine >= 0;

      routineResult = {
        estimatedRemaining: routineMid,
        rangeMin: rMin,
        rangeMax: rMax,
        isCovered: canCoverEssentialExpenses,
        remainingCashAfterRoutine,
        rangeRemainingMin,
        rangeRemainingMax,
      };
    }

    // 5. Goals & Protected Allocations Evaluation
    const goalsEvaluation: GoalAllocationCalculation[] = [];
    const goalImpactNotes: string[] = [];
    let areProtectedAllocationsMaintained: AssessmentStatus = true;
    let totalProtectedCommitments: number | null = null;
    let commitmentsShortfall: number | null = null;
    let isFullyCoveredIncludingAllCommitments: AssessmentStatus = true;

    // In Spending High: check if buffer (5M) + certification (3M) can both be maintained
    const certGoal = selected.relevantGoals.find((g) => g.title.toLowerCase().includes("sertifikasi"));
    if (isSpending && certGoal) {
      totalProtectedCommitments = minBuffer + certGoal.currentAllocated; // 5M + 3M = 8M
      const remainingAfterRoutine = routineResult?.remainingCashAfterRoutine ?? remainingCashAfterImmediateObligations;
      if (remainingAfterRoutine < totalProtectedCommitments) {
        commitmentsShortfall = totalProtectedCommitments - remainingAfterRoutine; // 8M - 7.4M = 600.000
        isFullyCoveredIncludingAllCommitments = false;
      } else {
        commitmentsShortfall = 0;
        isFullyCoveredIncludingAllCommitments = true;
      }
    }

    for (const g of selected.relevantGoals) {
      const remainingShortfall = Math.max(0, g.targetAmount - g.currentAllocated);

      if (isSpending) {
        if (g.title.toLowerCase().includes("laptop") || g.title.toLowerCase().includes("gadget")) {
          const isFullyAllocated = g.currentAllocated >= action.amount;
          goalsEvaluation.push({
            title: g.title,
            targetAmount: g.targetAmount,
            currentAllocated: g.currentAllocated,
            remainingShortfall,
            availableSurplusAfterObligations: remainingCashAfterImmediateObligations,
            canMeetGoal: canPayAction,
            isUntouchedAndProtected: true,
            explanation: isFullyAllocated
              ? `Dana alokasi laptop mencukupi seluruh nominal pembelian promo.`
              : `Alokasi khusus laptop (Rp ${g.currentAllocated.toLocaleString("id-ID")}) kurang Rp ${(action.amount - g.currentAllocated).toLocaleString("id-ID")} dari harga promo Rp ${action.amount.toLocaleString("id-ID")}, dan kekurangan ditutup dari kas operasional bulan berjalan.`,
          });
          goalImpactNotes.push(
            isFullyAllocated
              ? `Dana Alokasi Laptop mencukupi pembelian.`
              : `Pengeluaran melebihi sisa anggaran pos Dana Alokasi Laptop sebesar Rp ${(action.amount - g.currentAllocated).toLocaleString("id-ID")}.`
          );
        } else if (g.title.toLowerCase().includes("sertifikasi")) {
          // In Spending High: Certification Goal (3M)
          const isCertProtected = constraints?.prohibitCertificationFunds !== false;
          if (isCertProtected) {
            goalsEvaluation.push({
              title: g.title,
              targetAmount: g.targetAmount,
              currentAllocated: g.currentAllocated,
              remainingShortfall,
              availableSurplusAfterObligations: remainingCashAfterImmediateObligations,
              canMeetGoal: true,
              isUntouchedAndProtected: true,
              explanation:
                commitmentsShortfall && commitmentsShortfall > 0
                  ? `Pos alokasi Program Sertifikasi Profesional (Rp ${g.currentAllocated.toLocaleString("id-ID")}) dipertahankan utuh dan tidak digunakan untuk pembelian laptop. Namun, jika Dana Darurat Rp ${minBuffer.toLocaleString("id-ID")} juga dipertahankan utuh, sisa kas setelah tagihan dan kebutuhan rutin 12 hari (Rp ${(routineResult?.remainingCashAfterRoutine || 0).toLocaleString("id-ID")}) menyisakan selisih kekurangan (shortfall) Rp ${commitmentsShortfall.toLocaleString("id-ID")}.`
                  : `Pos alokasi Program Sertifikasi Profesional (Rp ${g.currentAllocated.toLocaleString("id-ID")}) dipertahankan utuh.`,
            });
            goalImpactNotes.push(
              `Dana Program Sertifikasi Profesional (Rp ${g.currentAllocated.toLocaleString("id-ID")}) dipertahankan utuh.`
            );
          } else {
            areProtectedAllocationsMaintained = false;
            goalsEvaluation.push({
              title: g.title,
              targetAmount: g.targetAmount,
              currentAllocated: g.currentAllocated,
              remainingShortfall,
              availableSurplusAfterObligations: remainingCashAfterImmediateObligations,
              canMeetGoal: false,
              isUntouchedAndProtected: false,
              explanation: `Pos alokasi Program Sertifikasi Profesional berpotensi tergerus untuk menutupi kekurangan pembelian laptop.`,
            });
            goalImpactNotes.push("Pos alokasi Program Sertifikasi Profesional berpotensi tergerus.");
          }
        }
      } else {
        // Saving scenarios
        if (g.title.toLowerCase().includes("darurat")) {
          const currentAccum = g.currentAllocated;
          const newAccum = currentAccum + action.amount;
          const target = g.targetAmount;
          const shortfall = Math.max(0, target - newAccum);
          
          goalsEvaluation.push({
            title: g.title,
            targetAmount: target,
            currentAllocated: currentAccum,
            remainingShortfall: shortfall,
            availableSurplusAfterObligations: remainingCashAfterImmediateObligations,
            canMeetGoal: newAccum >= target,
            isUntouchedAndProtected: true,
            explanation: action.amount > 0
              ? `Penambahan Rp ${action.amount.toLocaleString("id-ID")} meningkatkan akumulasi Dana Darurat dari Rp ${currentAccum.toLocaleString("id-ID")} menjadi Rp ${newAccum.toLocaleString("id-ID")} (kekurangan Rp ${shortfall.toLocaleString("id-ID")} menuju target Rp ${target.toLocaleString("id-ID")}).`
              : `Dana Darurat saat ini terkumpul Rp ${currentAccum.toLocaleString("id-ID")} (kekurangan Rp ${shortfall.toLocaleString("id-ID")} menuju target Rp ${target.toLocaleString("id-ID")}).`,
          });
          goalImpactNotes.push(
            `Akumulasi Dana Darurat: Rp ${newAccum.toLocaleString("id-ID")} (target Rp ${target.toLocaleString("id-ID")}).`
          );
        } else if (g.title.toLowerCase().includes("sertifikasi")) {
          // Saving High: Certification Goal (2M)
          // Existing 2M remains intact in the bank! It does NOT become 0!
          // However, additional monthly allocation is 0 if action.amount takes all surplus.
          goalsEvaluation.push({
            title: g.title,
            targetAmount: g.targetAmount,
            currentAllocated: g.currentAllocated,
            remainingShortfall,
            availableSurplusAfterObligations: remainingCashAfterImmediateObligations,
            canMeetGoal: true,
            isUntouchedAndProtected: true,
            explanation: `Dana sertifikasi yang telah terkumpul sebelumnya (Rp ${g.currentAllocated.toLocaleString("id-ID")}) tetap utuh mengendap di rekening. Namun, pada bulan ini tidak ada tambahan alokasi baru untuk pos sertifikasi.`,
          });
          goalImpactNotes.push("Dana sertifikasi yang telah terkumpul tetap utuh mengendap di rekening.");
        }
      }
    }

    // 6. Installment calculation if applicable
    let installmentDetails: InstallmentCalculation | null = null;
    if (profile.laptopOffer) {
      installmentDetails = calculateInstallmentDetails(profile.laptopOffer.price);
    }

    // 7. Baseline and Alternatives for Saving Scenario
    let baselineSurplusBeforeAction: number | null = null;
    let baselineSurplusRange: { min: number; max: number } | null = null;
    let alternativesEvaluation: FinancialCalculationResult["alternativesEvaluation"] = undefined;
    let recommendedAmount: number | null = null;
    let recommendedAmountReason: string | null = null;

    if (isSaving) {
      const cashAfterBillsBeforeSaving = (operatingCashBefore ?? 8000000) - totalLiabilitiesBeforeIncome;
      const routineEst = profile.routineExpenses?.remainingEstimate ?? 2700000;
      const routineMin = profile.routineExpenses?.range?.min ?? 2400000;
      const routineMax = profile.routineExpenses?.range?.max ?? 3000000;

      baselineSurplusBeforeAction = cashAfterBillsBeforeSaving - routineEst; // 4.5M - 2.7M = 1.8M
      baselineSurplusRange = {
        min: cashAfterBillsBeforeSaving - routineMax, // 1.5M
        max: cashAfterBillsBeforeSaving - routineMin, // 2.1M
      };

      alternativesEvaluation = [
        {
          amount: 1000000,
          label: "Rp 1.000.000",
          remainingCash: baselineSurplusBeforeAction - 1000000, // 800.000
          canCoverRoutine: true,
          notes: "Arus kas bulanan tetap surplus Rp 800.000 (rentang Rp 500.000 – Rp 1.100.000). Sangat aman.",
        },
        {
          amount: 2000000,
          label: "Rp 2.000.000",
          remainingCash: baselineSurplusBeforeAction - 2000000, // -200.000
          canCoverRoutine: false,
          notes: "Arus kas bulanan defisit Rp 200.000 (rentang defisit Rp 500.000 hingga surplus tipis Rp 100.000). Berisiko mengganggu kelancaran kas harian.",
        },
        {
          amount: 3000000,
          label: "Rp 3.000.000",
          remainingCash: baselineSurplusBeforeAction - 3000000, // -1.200.000
          canCoverRoutine: false,
          notes: "Arus kas bulanan defisit berat Rp 1.200.000. Sangat tidak disarankan.",
        },
      ];

      recommendedAmount = 1000000;
      recommendedAmountReason =
        "Nominal Rp 1.000.000 paling aman karena masih menyisakan cadangan kas operasional bulanan sebesar Rp 800.000 setelah seluruh tagihan dan kebutuhan hidup rutin terpenuhi.";
    }

    // 8. Deterministic Facts & Stated Assumptions
    const deterministicFacts: string[] = [];
    const statedAssumptions: string[] = [];
    const unknownVariables: string[] = [];

    // Horizon fact
    let daysToNextIncome = 30;
    if (profile.h0Date && profile.incomeSchedule?.nextDate) {
      const h0 = new Date(profile.h0Date);
      const nextInc = new Date(profile.incomeSchedule.nextDate);
      const diffDays = Math.round((nextInc.getTime() - h0.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        daysToNextIncome = diffDays;
      }
    } else if (profile.scenarioId?.startsWith("spending") || isSpending) {
      daysToNextIncome = 12;
    } else {
      daysToNextIncome = 30;
    }
    deterministicFacts.push(
      `Gajian berikutnya diperkirakan diterima dalam ${daysToNextIncome} hari.`
    );

    // Balance fact
    if (isSpending) {
      deterministicFacts.push(
        `Saldo rekening saat ini: Rp ${initialBalance.toLocaleString("id-ID")}. Pembelian tunai laptop Rp ${action.amount.toLocaleString("id-ID")} akan mengurangi saldo rekening menjadi Rp ${balanceAfterAction.toLocaleString("id-ID")}.`
      );
      if (isBudgetExceeded) {
        deterministicFacts.push(
          `Alokasi khusus laptop saat ini adalah Rp ${(virtualAllocationsBefore["laptop"] || 0).toLocaleString("id-ID")}, sehingga terdapat kekurangan alokasi sebesar Rp ${Math.abs(budgetVariance || 0).toLocaleString("id-ID")}. Kekurangan ini ditutup dari uang kebutuhan bulan ini (tersisa Rp ${operatingCashAfterAction?.toLocaleString("id-ID")}).`
        );
      }
    } else {
      deterministicFacts.push(
        `Saldo total rekening bank adalah Rp ${initialBalance.toLocaleString("id-ID")}. Penambahan tabungan dana darurat merupakan alokasi virtual di rekening yang sama, sehingga total saldo rekening tetap Rp ${balanceAfterAction.toLocaleString("id-ID")}.`
      );
      if (action.amount > 0) {
        deterministicFacts.push(
          `Menyetor tabungan Rp ${action.amount.toLocaleString("id-ID")} memotong pos uang kebutuhan bulan ini dari Rp ${operatingCashBefore?.toLocaleString("id-ID")} menjadi Rp ${operatingCashAfterAction?.toLocaleString("id-ID")}, dan meningkatkan alokasi Dana Darurat menjadi Rp ${(virtualAllocationsAfter["emergency"] || 0).toLocaleString("id-ID")}.`
        );
      } else {
        deterministicFacts.push(
          `Belum ada nominal tabungan yang dipilih. Surplus arus kas bulanan sebelum penyisihan tabungan adalah Rp ${baselineSurplusBeforeAction?.toLocaleString("id-ID")} (rentang Rp ${baselineSurplusRange?.min.toLocaleString("id-ID")} – Rp ${baselineSurplusRange?.max.toLocaleString("id-ID")}).`
        );
      }
      deterministicFacts.push(
        `Rekomendasi alokasi tabungan yang aman: Rp 1.000.000 (menyisakan uang kebutuhan bulan ini Rp 800.000). Menabung Rp 2.000.000 akan memicu defisit kas bulanan Rp 200.000.`
      );
    }

    // Liabilities fact
    if (liabilitiesDueBeforeIncome.length > 0) {
      const billDetails = liabilitiesDueBeforeIncome
        .map((l) => {
          let timingText = "dalam waktu dekat";
          if (l.dueDate && profile.h0Date) {
            const due = new Date(l.dueDate);
            const h0 = new Date(profile.h0Date);
            const diffDays = Math.round((due.getTime() - h0.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
              timingText = `dalam ${diffDays} hari ke depan`;
            } else if (diffDays === 0) {
              timingText = "hari ini";
            }
          }
          return `${l.title} (Rp ${l.amount.toLocaleString("id-ID")}, harus dibayar ${timingText})`;
        })
        .join(", ");
      deterministicFacts.push(
        `Kewajiban tagihan wajib sebelum gajian berikutnya: total Rp ${totalLiabilitiesBeforeIncome.toLocaleString("id-ID")} [${billDetails}].`
      );
    }

    // Operating cash after bills
    deterministicFacts.push(
      `Sisa uang kebutuhan bulan ini setelah melunasi kewajiban tagihan terdekat: Rp ${remainingCashAfterImmediateObligations.toLocaleString("id-ID")}.`
    );

    // Buffer fact
    if (isSpending) {
      if (isBufferMaintained) {
        deterministicFacts.push(
          `Batas buffer dana darurat (minimal Rp ${minBuffer.toLocaleString("id-ID")}) tetap terlindungi secara aman.`
        );
      } else {
        deterministicFacts.push(
          `Sisa saldo rekening setelah tagihan berada Rp ${bufferShortfall.toLocaleString("id-ID")} di bawah batas minimum buffer dana darurat (target buffer minimal Rp ${minBuffer.toLocaleString("id-ID")}).`
        );
      }
    }

    // Routine expenses fact
    if (routineResult) {
      if (isSpending) {
        deterministicFacts.push(
          `Estimasi kebutuhan rutin tersisa hingga gajian (12 hari): rata-rata Rp ${routineResult.estimatedRemaining.toLocaleString("id-ID")} (rentang Rp ${routineResult.rangeMin?.toLocaleString("id-ID")} – Rp ${routineResult.rangeMax?.toLocaleString("id-ID")}). Sisa kas setelah tagihan (Rp ${remainingCashAfterImmediateObligations.toLocaleString("id-ID")}) mencukupi kebutuhan rutin ini dengan sisa akhir Rp ${routineResult.remainingCashAfterRoutine?.toLocaleString("id-ID")}.`
        );
      } else {
        // Saving
        if ((routineResult.remainingCashAfterRoutine || 0) < 0) {
          deterministicFacts.push(
            `Kebutuhan hidup rutin bulanan diperkirakan Rp ${routineResult.estimatedRemaining.toLocaleString("id-ID")} (rentang Rp ${routineResult.rangeMin?.toLocaleString("id-ID")} – Rp ${routineResult.rangeMax?.toLocaleString("id-ID")}). Dengan sisa kas operasional Rp ${remainingCashAfterImmediateObligations.toLocaleString("id-ID")}, terdapat defisit kas bulanan sebesar Rp ${Math.abs(routineResult.remainingCashAfterRoutine || 0).toLocaleString("id-ID")} berdasarkan estimasi tengah (rentang saldo akhir: ${routineResult.rangeRemainingMin?.toLocaleString("id-ID")} s.d. +Rp ${routineResult.rangeRemainingMax?.toLocaleString("id-ID")}).`
          );
        } else {
          deterministicFacts.push(
            `Kebutuhan hidup rutin bulanan diperkirakan Rp ${routineResult.estimatedRemaining.toLocaleString("id-ID")} (rentang Rp ${routineResult.rangeMin?.toLocaleString("id-ID")} – Rp ${routineResult.rangeMax?.toLocaleString("id-ID")}). Sisa kas operasional (Rp ${remainingCashAfterImmediateObligations.toLocaleString("id-ID")}) mencukupi kebutuhan rutin dengan surplus Rp ${routineResult.remainingCashAfterRoutine?.toLocaleString("id-ID")}.`
          );
        }
      }
    }

    if (isSpending && commitmentsShortfall && commitmentsShortfall > 0) {
      deterministicFacts.push(
        `Perhatian komitmen alokasi: Sisa kas setelah tagihan dan estimasi kebutuhan rutin (12 hari) adalah Rp ${(routineResult?.remainingCashAfterRoutine || 0).toLocaleString("id-ID")}. Untuk mempertahankan Dana Darurat Rp ${minBuffer.toLocaleString("id-ID")} dan Alokasi Sertifikasi Rp ${(certGoal?.currentAllocated || 0).toLocaleString("id-ID")} secara bersamaan dibutuhkan Rp ${totalProtectedCommitments?.toLocaleString("id-ID")}, sehingga terdapat selisih kekurangan (shortfall) sebesar Rp ${commitmentsShortfall.toLocaleString("id-ID")}. Oleh karena itu, kedua pos proteksi tidak dapat dipertahankan utuh sekaligus tanpa mengorbankan salah satunya jika laptop dibeli sekarang.`
      );
    }

    // Goals facts
    for (const ge of goalsEvaluation) {
      deterministicFacts.push(ge.explanation);
    }

    // Installment fact if spending
    if (isSpending && installmentDetails) {
      deterministicFacts.push(
        `Opsi Cicilan 12 Bulan: Angsuran Rp ${installmentDetails.monthlyTotalInstallment.toLocaleString("id-ID")}/bulan (pokok Rp ${Math.round(installmentDetails.monthlyPrincipal).toLocaleString("id-ID")} + bunga flat 1,2% Rp ${installmentDetails.monthlyFlatInterest.toLocaleString("id-ID")}), ditambah biaya administrasi 1% Rp ${installmentDetails.adminFee.toLocaleString("id-ID")}. Total pembayaran cicilan adalah Rp ${installmentDetails.totalPayment12Months.toLocaleString("id-ID")} (lebih mahal Rp ${installmentDetails.excessOverCash.toLocaleString("id-ID")} dibandingkan tunai).`
      );
      statedAssumptions.push(
        "Jadwal pembayaran pertama dan waktu pembayaran administrasi cicilan belum ditentukan dalam instrumen."
      );
    }

    // Stated Assumptions & Unknowns
    if (isSaving) {
      statedAssumptions.push(
        "Tagihan utilitas bulan berjalan merupakan nilai estimasi (rentang Rp400.000–Rp600.000, titik tengah Rp500.000) dan belum memiliki tanggal jatuh tempo pasti."
      );
    }

    return {
      status: "valid",
      actionAmount: action.amount,
      actionType: action.type,
      initialBalance,
      balanceAfterAction,
      netCashFlowImpact,
      virtualAllocationsBefore,
      virtualAllocationsAfter,
      operatingCashBefore,
      operatingCashAfterAction,
      relevantBudget: selected.relevantBudget,
      budgetVariance,
      isBudgetExceeded,
      budgetShortfallCoverSource,
      nextIncomeDate: profile.incomeSchedule.nextDate,
      daysToNextIncome,
      liabilitiesDueBeforeIncome,
      totalLiabilitiesBeforeIncome,
      liabilitiesDueAfterIncome,
      totalLiabilitiesAfterIncome,
      remainingCashAfterImmediateObligations,
      isLiquidityThreatened,
      deficitAmount,
      routineExpenses: routineResult,
      emergencyFundEvaluation: profile.emergencyTarget
        ? {
            currentAccumulated: virtualAllocationsBefore["emergency"] || 8000000,
            targetAmount: profile.emergencyTarget,
            newAccumulated: virtualAllocationsAfter["emergency"] || 8000000,
            remainingShortfall: Math.max(
              0,
              profile.emergencyTarget - (virtualAllocationsAfter["emergency"] || 8000000)
            ),
            percentageOfTarget: Math.round(
              ((virtualAllocationsAfter["emergency"] || 8000000) / profile.emergencyTarget) * 100
            ),
          }
        : null,
      installmentDetails,
      canPayAction,
      canCoverObligations,
      canCoverEssentialExpenses,
      isBufferMaintained,
      areProtectedAllocationsMaintained,
      totalProtectedCommitments,
      commitmentsShortfall,
      isFullyCoveredIncludingAllCommitments,
      baselineSurplusBeforeAction,
      baselineSurplusRange,
      alternativesEvaluation,
      recommendedAmount,
      recommendedAmountReason,
      bufferImpact: {
        minBuffer,
        projectedBufferRemaining: Math.max(0, remainingCashAfterImmediateObligations),
        bufferShortfall,
        isBufferIntact: isBufferMaintained,
      },
      goalsEvaluation,
      goalImpactNotes,
      statedAssumptions,
      unknownVariables,
      deterministicFacts,
    };
  }

  // =========================================================================
  // Case B: Basic Condition (No initial profile; uses userProvided data if given)
  // =========================================================================
  const isSpending = action.type === "spending";
  const isSaving = action.type === "saving";
  const userBalance = userProvided?.balance ?? null;
  const userBudget = userProvided?.budget ?? null;
  const userLiabilities = userProvided?.liabilities ?? null;
  const userBuffer = userProvided?.buffer ?? null;
  const userRoutine = userProvided?.routine ?? null;
  const userIncome = userProvided?.income ?? null;
  const userEmergencyCurrent = userProvided?.emergencyCurrent ?? userBuffer ?? null;
  const userEmergencyTarget = userProvided?.emergencyTarget ?? null;

  const hasUserData =
    userBalance !== null ||
    userBudget !== null ||
    userLiabilities !== null ||
    userIncome !== null ||
    userRoutine !== null ||
    userBuffer !== null ||
    userEmergencyTarget !== null;

  if (!hasUserData) {
    // Zero user data yet
    const initialBalance = null;
    const balanceAfterAction = null;
    const netCashFlowImpact = isSpending ? action.amount : 0;

    const deterministicFacts: string[] = [
      `Kondisi: Asisten Keuangan (Sesi tanpa profil keuangan awal).`,
      `Rencana yang sedang dipertimbangkan: ${isSpending ? "Pengeluaran" : "Penyisihan Tabungan"} sebesar Rp ${action.amount.toLocaleString("id-ID")} untuk ${action.targetCategory}.`,
      isSpending && action.amount > 0
        ? `Kelayakan pembelian tunai Rp ${action.amount.toLocaleString("id-ID")} bergantung pada saldo rekening yang tersedia dan kewajiban kebutuhan yang harus dibayar.`
        : `Kelayakan penyisihan tabungan bergantung pada pendapatan dan kebutuhan bulanan yang harus dipenuhi.`,
    ];

    return {
      status: "needs_clarification",
      clarificationReason:
        "Informasi saldo kas, pos anggaran, dan tagihan terdekat belum disampaikan oleh pengguna dalam sesi ini.",
      actionAmount: action.amount,
      actionType: action.type,
      initialBalance,
      balanceAfterAction,
      netCashFlowImpact,
      virtualAllocationsBefore: {},
      virtualAllocationsAfter: {},
      operatingCashBefore: null,
      operatingCashAfterAction: null,
      relevantBudget: null,
      budgetVariance: null,
      isBudgetExceeded: false,
      nextIncomeDate: null,
      daysToNextIncome: null,
      liabilitiesDueBeforeIncome: [],
      totalLiabilitiesBeforeIncome: 0,
      liabilitiesDueAfterIncome: [],
      totalLiabilitiesAfterIncome: 0,
      remainingCashAfterImmediateObligations: null,
      isLiquidityThreatened: false,
      deficitAmount: 0,
      routineExpenses: null,
      installmentDetails: null,
      canPayAction: "unknown",
      canCoverObligations: "unknown",
      canCoverEssentialExpenses: "unknown",
      isBufferMaintained: "unknown",
      areProtectedAllocationsMaintained: "unknown",
      bufferImpact: {
        minBuffer: null,
        projectedBufferRemaining: null,
        bufferShortfall: 0,
        isBufferIntact: "unknown",
      },
      goalsEvaluation: [],
      goalImpactNotes: [],
      statedAssumptions: [
        "Perhitungan presisi memerlukan informasi saldo kas, tagihan jatuh tempo, dan kebutuhan rutin dari pengguna.",
      ],
      unknownVariables: [
        "saldo kas saat ini",
        "total tagihan terdekat",
        "estimasi kebutuhan rutin harian",
        "target batas buffer dana darurat",
      ],
      deterministicFacts,
    };
  }

  // Partial or full user provided finances
  const initialBalance = userBalance !== null ? userBalance : userIncome;
  const balanceAfterAction =
    initialBalance !== null ? (isSpending ? initialBalance - action.amount : initialBalance) : null;
  const canPayAction: AssessmentStatus =
    initialBalance !== null ? (isSpending ? initialBalance >= action.amount : true) : "unknown";

  let budgetVariance: number | null = null;
  let isBudgetExceeded = false;
  if (userBudget !== null) {
    budgetVariance = userBudget - action.amount;
    isBudgetExceeded = budgetVariance < 0;
  }

  const totalLiabilitiesBeforeIncome = userLiabilities ?? 0;
  let remainingCashAfterImmediateObligations: number | null = null;
  if (isSaving) {
    const cashBase = userIncome !== null ? userIncome : userBalance;
    remainingCashAfterImmediateObligations =
      cashBase !== null ? cashBase - totalLiabilitiesBeforeIncome - action.amount : null;
  } else {
    remainingCashAfterImmediateObligations =
      balanceAfterAction !== null ? balanceAfterAction - totalLiabilitiesBeforeIncome : null;
  }

  let canCoverObligations: AssessmentStatus = "unknown";
  if (remainingCashAfterImmediateObligations !== null) {
    canCoverObligations = remainingCashAfterImmediateObligations >= 0;
  }

  let isLiquidityThreatened = canCoverObligations === false;
  let deficitAmount =
    remainingCashAfterImmediateObligations !== null && remainingCashAfterImmediateObligations < 0
      ? Math.abs(remainingCashAfterImmediateObligations)
      : 0;

  const minBuffer = userBuffer ?? 0;
  let isBufferMaintained: AssessmentStatus = "unknown";
  let bufferShortfall = 0;
  if (remainingCashAfterImmediateObligations !== null && minBuffer > 0) {
    isBufferMaintained = remainingCashAfterImmediateObligations >= minBuffer;
    bufferShortfall = isBufferMaintained ? 0 : minBuffer - remainingCashAfterImmediateObligations;
  }

  let routineResult: FinancialCalculationResult["routineExpenses"] = null;
  let canCoverEssentialExpenses: AssessmentStatus = "unknown";
  if (userRoutine !== null && remainingCashAfterImmediateObligations !== null) {
    const rem = remainingCashAfterImmediateObligations - userRoutine;
    canCoverEssentialExpenses = rem >= 0;
    if (rem < 0) {
      isLiquidityThreatened = true;
      deficitAmount = Math.abs(rem);
    }
    routineResult = {
      estimatedRemaining: userRoutine,
      isCovered: canCoverEssentialExpenses,
      remainingCashAfterRoutine: rem,
    };
  }

  const deterministicFacts: string[] = [
    `Kondisi: Basic Information Assistant dengan data yang disampaikan pengguna.`,
  ];

  if (userIncome !== null) {
    deterministicFacts.push(
      `Pendapatan bulanan pengguna: Rp ${userIncome.toLocaleString("id-ID")}.`
    );
  }

  if (initialBalance !== null && balanceAfterAction !== null) {
    if (isSpending) {
      deterministicFacts.push(
        `Berdasarkan data pengguna, saldo rekening saat ini Rp ${initialBalance.toLocaleString("id-ID")}. Setelah pengeluaran Rp ${action.amount.toLocaleString("id-ID")}, saldo rekening menjadi Rp ${balanceAfterAction.toLocaleString("id-ID")}.`
      );
    } else {
      deterministicFacts.push(
        `Total saldo rekening tetap Rp ${initialBalance.toLocaleString("id-ID")} karena penambahan tabungan merupakan pemindahan alokasi pos internal rekening.`
      );
    }
  }

  if (budgetVariance !== null) {
    deterministicFacts.push(
      `Alokasi anggaran yang disampaikan Rp ${userBudget?.toLocaleString("id-ID")}. Selisih anggaran: ${budgetVariance >= 0 ? "sisa Rp " + budgetVariance.toLocaleString("id-ID") : "melebihi pagu sebesar Rp " + Math.abs(budgetVariance).toLocaleString("id-ID")}.`
    );
  }

  if (userLiabilities !== null && remainingCashAfterImmediateObligations !== null) {
    deterministicFacts.push(
      `Kewajiban tagihan yang disampaikan Rp ${userLiabilities.toLocaleString("id-ID")}. Sisa uang kebutuhan bulan ini setelah tagihan adalah Rp ${remainingCashAfterImmediateObligations.toLocaleString("id-ID")}.`
    );
  }

  if (userRoutine !== null && routineResult) {
    deterministicFacts.push(
      `Kebutuhan pengeluaran rutin bulanan: Rp ${userRoutine.toLocaleString("id-ID")}.`
    );
    if ((routineResult.remainingCashAfterRoutine || 0) < 0) {
      deterministicFacts.push(
        `Setelah menyisihkan Rp ${action.amount.toLocaleString("id-ID")} dan memperhitungkan kebutuhan rutin Rp ${userRoutine.toLocaleString("id-ID")}, arus kas bulanan mengalami defisit sebesar Rp ${Math.abs(routineResult.remainingCashAfterRoutine || 0).toLocaleString("id-ID")}.`
      );
      if (isSaving && userIncome !== null) {
        const netCashBeforeSaving = userIncome - totalLiabilitiesBeforeIncome - userRoutine;
        const altSaving = 1000000;
        const surplusWithAlt = netCashBeforeSaving - altSaving;
        if (surplusWithAlt >= 0) {
          deterministicFacts.push(
            `Opsi alternatif: Jika penyisihan tabungan disesuaikan menjadi Rp ${altSaving.toLocaleString("id-ID")}, kebutuhan bulanan Rp ${userRoutine.toLocaleString("id-ID")} tetap terpenuhi dengan sisa cadangan kas Rp ${surplusWithAlt.toLocaleString("id-ID")}.`
          );
        }
      }
    } else {
      deterministicFacts.push(
        `Setelah penyisihan Rp ${action.amount.toLocaleString("id-ID")}, sisa kas operasional bulanan masih surplus Rp ${(routineResult.remainingCashAfterRoutine || 0).toLocaleString("id-ID")} di atas kebutuhan bulanan.`
      );
    }
  }

  if (minBuffer > 0) {
    if (isBufferMaintained === true) {
      deterministicFacts.push(
        `Batas dana cadangan minimum yang ingin dipertahankan (Rp ${minBuffer.toLocaleString("id-ID")}) tetap terlindungi.`
      );
    } else if (isBufferMaintained === false) {
      deterministicFacts.push(
        `Sisa kas berada Rp ${bufferShortfall.toLocaleString("id-ID")} di bawah batas dana cadangan minimum (Rp ${minBuffer.toLocaleString("id-ID")}).`
      );
    }
  }

  let emergencyFundEvaluation: FinancialCalculationResult["emergencyFundEvaluation"] = null;
  if (userEmergencyTarget && userEmergencyCurrent) {
    const newAccum = userEmergencyCurrent + (isSaving ? action.amount : 0);
    const shortfall = Math.max(0, userEmergencyTarget - newAccum);
    emergencyFundEvaluation = {
      currentAccumulated: userEmergencyCurrent,
      targetAmount: userEmergencyTarget,
      newAccumulated: newAccum,
      remainingShortfall: shortfall,
      percentageOfTarget: Math.round((newAccum / userEmergencyTarget) * 100),
    };
    deterministicFacts.push(
      `Akumulasi dana darurat saat ini: Rp ${userEmergencyCurrent.toLocaleString("id-ID")} (target Rp ${userEmergencyTarget.toLocaleString("id-ID")}, kekurangan Rp ${(userEmergencyTarget - userEmergencyCurrent).toLocaleString("id-ID")}). Setelah penambahan Rp ${action.amount.toLocaleString("id-ID")}, dana darurat menjadi Rp ${newAccum.toLocaleString("id-ID")} (kekurangan Rp ${shortfall.toLocaleString("id-ID")}).`
    );
  }

  let baselineSurplusBeforeAction: number | null = null;
  let baselineSurplusRange: { min: number; max: number } | null = null;
  let alternativesEvaluation: FinancialCalculationResult["alternativesEvaluation"] = undefined;
  let recommendedAmount: number | null = null;
  let recommendedAmountReason: string | null = null;

  if (isSaving && userIncome !== null) {
    const cashAfterBills = userIncome - totalLiabilitiesBeforeIncome;
    const routine = userRoutine ?? 0;
    baselineSurplusBeforeAction = cashAfterBills - routine;
    baselineSurplusRange = {
      min: baselineSurplusBeforeAction - 300000,
      max: baselineSurplusBeforeAction + 300000,
    };
    if (baselineSurplusBeforeAction >= 1000000) {
      recommendedAmount = 1000000;
      recommendedAmountReason = `Nominal Rp 1.000.000 aman karena menyisakan surplus operasional Rp ${(baselineSurplusBeforeAction - 1000000).toLocaleString("id-ID")}.`;
    }
    alternativesEvaluation = [
      {
        amount: 1000000,
        label: "Rp 1.000.000",
        remainingCash: baselineSurplusBeforeAction - 1000000,
        canCoverRoutine: baselineSurplusBeforeAction - 1000000 >= 0,
        notes: baselineSurplusBeforeAction - 1000000 >= 0 ? "Surplus kas bulanan aman." : "Defisit kas.",
      },
      {
        amount: 2000000,
        label: "Rp 2.000.000",
        remainingCash: baselineSurplusBeforeAction - 2000000,
        canCoverRoutine: baselineSurplusBeforeAction - 2000000 >= 0,
        notes: baselineSurplusBeforeAction - 2000000 >= 0 ? "Surplus kas mencukupi." : "Defisit kas bulanan.",
      },
    ];
  }

  return {
    status: "valid",
    actionAmount: action.amount,
    actionType: action.type,
    initialBalance,
    balanceAfterAction,
    netCashFlowImpact: isSpending ? action.amount : 0,
    virtualAllocationsBefore: {},
    virtualAllocationsAfter: {},
    operatingCashBefore: userIncome,
    operatingCashAfterAction: remainingCashAfterImmediateObligations,
    relevantBudget: userBudget ? { category: "Anggaran Pengguna", allocated: userBudget, spentSoFar: 0, remaining: userBudget, source: "user_message" } : null,
    budgetVariance,
    isBudgetExceeded,
    nextIncomeDate: null,
    daysToNextIncome: null,
    liabilitiesDueBeforeIncome: userLiabilities ? [{ title: "Tagihan Pengguna", amount: userLiabilities, dueDate: null, isPriority: true, status: "unpaid", source: "user_message" }] : [],
    totalLiabilitiesBeforeIncome,
    liabilitiesDueAfterIncome: [],
    totalLiabilitiesAfterIncome: 0,
    remainingCashAfterImmediateObligations,
    isLiquidityThreatened,
    deficitAmount,
    routineExpenses: routineResult,
    emergencyFundEvaluation,
    installmentDetails: null,
    canPayAction,
    canCoverObligations,
    canCoverEssentialExpenses,
    isBufferMaintained,
    areProtectedAllocationsMaintained: "unknown",
    totalProtectedCommitments: null,
    commitmentsShortfall: null,
    isFullyCoveredIncludingAllCommitments: "unknown",
    baselineSurplusBeforeAction,
    baselineSurplusRange,
    alternativesEvaluation,
    recommendedAmount,
    recommendedAmountReason,
    bufferImpact: {
      minBuffer,
      projectedBufferRemaining: remainingCashAfterImmediateObligations ? Math.max(0, remainingCashAfterImmediateObligations) : null,
      bufferShortfall,
      isBufferIntact: isBufferMaintained,
    },
    goalsEvaluation: [],
    goalImpactNotes: [],
    statedAssumptions: [
      "Perhitungan didasarkan pada angka yang disampaikan secara sukarela oleh pengguna dalam sesi ini.",
    ],
    unknownVariables: [
      ...(userBalance === null && userIncome === null ? ["saldo kas / pemasukan"] : []),
      ...(userLiabilities === null ? ["total tagihan"] : []),
      ...(userRoutine === null ? ["kebutuhan rutin"] : []),
    ],
    deterministicFacts,
  };
}
