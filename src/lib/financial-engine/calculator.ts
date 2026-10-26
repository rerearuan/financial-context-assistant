import {
  AssessmentStatus,
  FinancialAction,
  FinancialCalculationResult,
  FinancialProfileContext,
  GoalAllocationCalculation,
  UserProvidedFinances,
} from "./types";
import { selectRelevantFinancialContext } from "./relevant-selector";

/**
 * Deterministic Financial Calculator
 * Strictly calculates consequences in code without relying on LLM arithmetic.
 */
export function calculateFinancialConsequences(
  action: FinancialAction,
  profile?: FinancialProfileContext | null,
  userProvided?: UserProvidedFinances | null
): FinancialCalculationResult {
  // =========================================================================
  // Case A: Context-Aware (Synthetic Profile available)
  // =========================================================================
  if (profile) {
    const selected = selectRelevantFinancialContext(profile, action);
    const initialBalance = profile.totalCashBalance;
    const balanceAfterAction = initialBalance - action.amount;
    const canPayAction: AssessmentStatus = initialBalance >= action.amount;

    let budgetVariance: number | null = null;
    let isBudgetExceeded = false;
    if (selected.relevantBudget) {
      budgetVariance = selected.relevantBudget.remaining - action.amount;
      isBudgetExceeded = budgetVariance < 0;
    }

    const totalLiabilitiesBeforeIncome = selected.totalLiabilitiesBeforeIncome;
    const remainingCashAfterImmediateObligations =
      balanceAfterAction - totalLiabilitiesBeforeIncome;
    const canCoverObligations: AssessmentStatus =
      remainingCashAfterImmediateObligations >= 0;
    const isLiquidityThreatened = !canCoverObligations;
    const deficitAmount = isLiquidityThreatened
      ? Math.abs(remainingCashAfterImmediateObligations)
      : 0;

    // Buffer check
    const minBuffer = profile.buffer?.minAmount || 0;
    const projectedBufferRemaining = Math.max(0, remainingCashAfterImmediateObligations);
    const isBufferMaintained: AssessmentStatus =
      remainingCashAfterImmediateObligations >= minBuffer;
    const bufferShortfall = isBufferMaintained
      ? 0
      : Math.max(0, minBuffer - remainingCashAfterImmediateObligations);

    // Essential daily expenses check:
    // In scenarios, daily routine needs are based on historical estimates and not fixed contracted obligations.
    // Therefore, exact coverage cannot be definitively certified without explicit real-time expense data.
    const canCoverEssentialExpenses: AssessmentStatus = "unknown";

    // Goals & Protected Allocations Evaluation
    const goalsEvaluation: GoalAllocationCalculation[] = [];
    const goalImpactNotes: string[] = [];
    let areProtectedAllocationsMaintained: AssessmentStatus = true;

    // Evaluate goals against available surplus
    for (const g of selected.relevantGoals) {
      const remainingShortfall = Math.max(0, g.targetAmount - g.currentAllocated);

      if (action.type === "spending") {
        // In spending, if action exceeds designated budget, does it infringe on other goal funds or buffer?
        if (g.title.toLowerCase().includes("laptop") || g.title.toLowerCase().includes("gadget")) {
          // This goal is the purchase itself
          goalsEvaluation.push({
            title: g.title,
            targetAmount: g.targetAmount,
            currentAllocated: g.currentAllocated,
            remainingShortfall,
            availableSurplusAfterObligations: remainingCashAfterImmediateObligations,
            canMeetGoal: canPayAction,
            explanation: canPayAction
              ? `Pembelian dapat dieksekusi dengan saldo kas yang tersedia.`
              : `Saldo kas tidak mencukupi untuk melakukan pembelian tunai penuh.`,
          });
        } else {
          // Other protected goals (e.g. Program Sertifikasi)
          // Liquid surplus above buffer after action & immediate obligations:
          const surplusAboveBuffer = remainingCashAfterImmediateObligations - minBuffer;
          const isGoalFundIntact = surplusAboveBuffer >= g.currentAllocated;

          if (!isGoalFundIntact) {
            areProtectedAllocationsMaintained = false;
          }

          const deficitGoalFund = Math.max(0, g.currentAllocated - surplusAboveBuffer);

          goalsEvaluation.push({
            title: g.title,
            targetAmount: g.targetAmount,
            currentAllocated: g.currentAllocated,
            remainingShortfall,
            availableSurplusAfterObligations: surplusAboveBuffer,
            canMeetGoal: isGoalFundIntact,
            explanation: isGoalFundIntact
              ? `Dana yang telah disisihkan untuk ${g.title} (Rp ${g.currentAllocated.toLocaleString(
                  "id-ID"
                )}) tetap terlindungi tanpa terpakai.`
              : `Sisa dana likuid setelah buffer darurat (Rp ${Math.max(
                  0,
                  surplusAboveBuffer
                ).toLocaleString("id-ID")}) berada di bawah alokasi ${
                  g.title
                } (Rp ${g.currentAllocated.toLocaleString(
                  "id-ID"
                )}), sehingga berpotensi tergerus Rp ${deficitGoalFund.toLocaleString("id-ID")}.`,
          });

          if (!isGoalFundIntact) {
            goalImpactNotes.push(
              `Alokasi ${g.title} (Rp ${g.currentAllocated.toLocaleString(
                "id-ID"
              )}) berpotensi tergerus sebesar Rp ${deficitGoalFund.toLocaleString(
                "id-ID"
              )} karena sisa dana likuid di atas batas buffer tidak mencukupi.`
            );
          }
        }
      } else {
        // In saving scenarios:
        // Monthly income available for allocation = relevantBudget (e.g. Rp 8.000.000)
        // After this saving action (e.g. Rp 2.000.000 or Rp 5.000.000):
        const monthlyAvailable = selected.relevantBudget?.remaining ?? profile.incomeSchedule.amount;
        const remainingMonthlyAfterAction = monthlyAvailable - action.amount;
        const remainingMonthlyAfterBills = remainingMonthlyAfterAction - totalLiabilitiesBeforeIncome;

        if (g.title.toLowerCase().includes("darurat")) {
          // Emergency fund goal
          const newAllocated = g.currentAllocated + action.amount;
          const newShortfall = Math.max(0, g.targetAmount - newAllocated);
          goalsEvaluation.push({
            title: g.title,
            targetAmount: g.targetAmount,
            currentAllocated: newAllocated,
            remainingShortfall: newShortfall,
            availableSurplusAfterObligations: remainingMonthlyAfterBills,
            canMeetGoal: true,
            explanation: `Penambahan Rp ${action.amount.toLocaleString(
              "id-ID"
            )} meningkatkan akumulasi Dana Darurat menjadi Rp ${newAllocated.toLocaleString(
              "id-ID"
            )} (kekurangan menuju target tersisa Rp ${newShortfall.toLocaleString("id-ID")}).`,
          });
        } else {
          // Competing goal (e.g. Program Sertifikasi)
          // Check explicit numerical room left from monthly income after saving action and bills
          const roomForGoalFromMonthly = Math.max(0, remainingMonthlyAfterBills);
          const canFundGoal = remainingMonthlyAfterBills >= remainingShortfall;

          if (remainingMonthlyAfterBills <= 0) {
            areProtectedAllocationsMaintained = false;
          }

          goalsEvaluation.push({
            title: g.title,
            targetAmount: g.targetAmount,
            currentAllocated: g.currentAllocated,
            remainingShortfall,
            availableSurplusAfterObligations: remainingMonthlyAfterBills,
            canMeetGoal: canFundGoal,
            explanation:
              remainingMonthlyAfterBills <= 0
                ? `Setelah setoran Rp ${action.amount.toLocaleString(
                    "id-ID"
                  )} dan kewajiban terdekat Rp ${totalLiabilitiesBeforeIncome.toLocaleString(
                    "id-ID"
                  )}, sisa pendapatan bulan ini adalah Rp ${remainingMonthlyAfterBills.toLocaleString(
                    "id-ID"
                  )} (defisit Rp ${Math.abs(
                    remainingMonthlyAfterBills
                  ).toLocaleString("id-ID")}), sehingga ruang alokasi untuk pos ${
                    g.title
                  } pada bulan ini adalah Rp 0.`
                : `Sisa pendapatan setelah setoran dan kewajiban terdekat adalah Rp ${remainingMonthlyAfterBills.toLocaleString(
                    "id-ID"
                  )}. Ruang alokasi untuk pos ${g.title} (butuh Rp ${remainingShortfall.toLocaleString(
                    "id-ID"
                  )}) ${
                    canFundGoal
                      ? "tersedia secara proporsional"
                      : `hanya dapat dialokasikan sebagian (maksimal Rp ${roomForGoalFromMonthly.toLocaleString(
                          "id-ID"
                        )})`
                  }, belum memperhitungkan kebutuhan harian.`,
          });

          if (remainingMonthlyAfterBills <= 0) {
            goalImpactNotes.push(
              `Pendapatan bulan berjalan tidak menyisakan ruang alokasi (Rp 0) untuk pos ${g.title} karena sisa pendapatan setelah setoran (Rp ${remainingMonthlyAfterAction.toLocaleString(
                "id-ID"
              )}) lebih kecil dari total kewajiban terdekat (Rp ${totalLiabilitiesBeforeIncome.toLocaleString(
                "id-ID"
              )}).`
            );
          }
        }
      }
    }

    if (isBudgetExceeded && selected.relevantBudget) {
      goalImpactNotes.unshift(
        `Pengeluaran melebihi sisa anggaran pos ${selected.relevantBudget.category} sebesar Rp ${Math.abs(budgetVariance!).toLocaleString("id-ID")}.`
      );
    }

    // Deterministic factual statements for grounding LLM
    const deterministicFacts: string[] = [
      `Saldo rekening kas saat ini: Rp ${initialBalance.toLocaleString("id-ID")}.`,
      `Rencana nominal tindakan: Rp ${action.amount.toLocaleString("id-ID")}.`,
      `Sisa saldo kas setelah tindakan: Rp ${balanceAfterAction.toLocaleString("id-ID")} (${
        canPayAction ? "Saldo mencukupi pembayaran" : "Saldo tidak mencukupi"
      }).`,
    ];

    if (selected.relevantBudget) {
      deterministicFacts.push(
        `Alokasi anggaran pos ${selected.relevantBudget.category}: tersisa Rp ${selected.relevantBudget.remaining.toLocaleString(
          "id-ID"
        )} (${
          isBudgetExceeded
            ? `Melebihi alokasi pos sebesar Rp ${Math.abs(budgetVariance!).toLocaleString("id-ID")}`
            : `Sisa alokasi pos mencukupi dengan sisa Rp ${budgetVariance!.toLocaleString("id-ID")}`
        }).`
      );
    }

    if (selected.liabilitiesDueBeforeIncome.length > 0) {
      const listNames = selected.liabilitiesDueBeforeIncome
        .map((l) => `${l.title} (Rp ${l.amount.toLocaleString("id-ID")}, jatuh tempo ${l.dueDate})`)
        .join(", ");
      deterministicFacts.push(
        `Kewajiban terdekat yang jatuh tempo sebelum pemasukan berikutnya (${selected.nextIncomeDate}): total Rp ${totalLiabilitiesBeforeIncome.toLocaleString(
          "id-ID"
        )} [${listNames}].`
      );
      deterministicFacts.push(
        `Sisa kas operasional setelah tindakan dan kewajiban terdekat: Rp ${remainingCashAfterImmediateObligations.toLocaleString(
          "id-ID"
        )} (${
          canCoverObligations
            ? "Kewajiban terdekat tercukupi"
            : `Terjadi kekurangan kas sebesar Rp ${deficitAmount.toLocaleString("id-ID")}`
        }).`
      );
    } else {
      deterministicFacts.push(
        `Tidak ada kewajiban pembayaran yang jatuh tempo sebelum pemasukan berikutnya (${selected.nextIncomeDate}).`
      );
    }

    // Buffer factual reporting
    if (minBuffer > 0) {
      if (balanceAfterAction < minBuffer) {
        deterministicFacts.push(
          `Evaluasi buffer: Saldo setelah tindakan (Rp ${balanceAfterAction.toLocaleString(
            "id-ID"
          )}) BERADA DI BAWAH batas buffer dana darurat (minimal Rp ${minBuffer.toLocaleString(
            "id-ID"
          )}), dengan kekurangan awal Rp ${(minBuffer - balanceAfterAction).toLocaleString(
            "id-ID"
          )}. Setelah kewajiban terdekat (Rp ${totalLiabilitiesBeforeIncome.toLocaleString(
            "id-ID"
          )}), sisa kas menjadi Rp ${remainingCashAfterImmediateObligations.toLocaleString(
            "id-ID"
          )} (kekurangan buffer Rp ${bufferShortfall.toLocaleString("id-ID")}).`
        );
      } else if (!isBufferMaintained) {
        deterministicFacts.push(
          `Evaluasi buffer: Sisa kas setelah tindakan dan kewajiban (Rp ${remainingCashAfterImmediateObligations.toLocaleString(
            "id-ID"
          )}) BERADA DI BAWAH batas buffer dana darurat (minimal Rp ${minBuffer.toLocaleString(
            "id-ID"
          )}), kekurangan buffer sebesar Rp ${bufferShortfall.toLocaleString("id-ID")}.`
        );
      } else {
        deterministicFacts.push(
          `Evaluasi buffer: Batas buffer dana darurat (minimal Rp ${minBuffer.toLocaleString(
            "id-ID"
          )}) tetap terlindungi dengan kelebihan kas Rp ${(
            remainingCashAfterImmediateObligations - minBuffer
          ).toLocaleString("id-ID")}.`
        );
      }
    }

    // Essential daily expenses caveat
    deterministicFacts.push(
      `Cakupan kebutuhan harian: Kecukupan sisa dana untuk kebutuhan harian belum dapat dipastikan secara definitif karena nominal pasti kebutuhan harian hingga gajian berikutnya belum tercatat.`
    );

    // Goals facts
    for (const ge of goalsEvaluation) {
      deterministicFacts.push(`Pos tujuan ${ge.title}: ${ge.explanation}`);
    }

    return {
      status: "valid",
      actionAmount: action.amount,
      actionType: action.type,
      initialBalance,
      balanceAfterAction,
      relevantBudget: selected.relevantBudget,
      budgetVariance,
      isBudgetExceeded,
      nextIncomeDate: selected.nextIncomeDate,
      liabilitiesDueBeforeIncome: selected.liabilitiesDueBeforeIncome,
      totalLiabilitiesBeforeIncome,
      liabilitiesDueAfterIncome: selected.liabilitiesDueAfterIncome,
      totalLiabilitiesAfterIncome: selected.totalLiabilitiesAfterIncome,
      remainingCashAfterImmediateObligations,
      isLiquidityThreatened,
      deficitAmount,
      canPayAction,
      canCoverObligations,
      canCoverEssentialExpenses,
      isBufferMaintained,
      areProtectedAllocationsMaintained,
      bufferImpact: {
        minBuffer,
        projectedBufferRemaining,
        bufferShortfall,
        isBufferIntact: isBufferMaintained,
      },
      goalsEvaluation,
      goalImpactNotes,
      deterministicFacts,
    };
  }

  // =========================================================================
  // Case B: Basic Assistant with User-Provided Financial Data
  // =========================================================================
  if (
    userProvided &&
    (userProvided.balance !== undefined ||
      userProvided.budget !== undefined ||
      userProvided.liabilities !== undefined)
  ) {
    const initialBalance = userProvided.balance ?? null;
    const balanceAfterAction =
      initialBalance !== null ? initialBalance - action.amount : null;
    const canPayAction: AssessmentStatus =
      initialBalance !== null ? initialBalance >= action.amount : "unknown";

    let budgetVariance: number | null = null;
    let isBudgetExceeded = false;
    let relevantBudget: FinancialCalculationResult["relevantBudget"] = null;

    if (userProvided.budget !== undefined) {
      relevantBudget = {
        category: "Anggaran Pengguna",
        allocated: userProvided.budget,
        spentSoFar: 0,
        remaining: userProvided.budget,
        source: "user_message",
      };
      budgetVariance = userProvided.budget - action.amount;
      isBudgetExceeded = budgetVariance < 0;
    }

    const totalLiabilities = userProvided.liabilities ?? 0;
    const liabilitiesProvided = userProvided.liabilities !== undefined;

    const remainingCashAfterImmediateObligations =
      balanceAfterAction !== null && liabilitiesProvided
        ? balanceAfterAction - totalLiabilities
        : balanceAfterAction;

    const canCoverObligations: AssessmentStatus =
      balanceAfterAction !== null && liabilitiesProvided
        ? remainingCashAfterImmediateObligations! >= 0
        : "unknown";

    const isLiquidityThreatened =
      canCoverObligations === false ? true : false;
    const deficitAmount =
      canCoverObligations === false
        ? Math.abs(remainingCashAfterImmediateObligations!)
        : 0;

    const minBuffer = userProvided.buffer ?? null;
    let isBufferMaintained: AssessmentStatus = "unknown";
    let bufferShortfall = 0;
    let projectedBufferRemaining = remainingCashAfterImmediateObligations;

    if (minBuffer !== null && remainingCashAfterImmediateObligations !== null) {
      isBufferMaintained = remainingCashAfterImmediateObligations >= minBuffer;
      bufferShortfall = isBufferMaintained
        ? 0
        : Math.max(0, minBuffer - remainingCashAfterImmediateObligations);
    }

    const deterministicFacts: string[] = [
      `Nominal rencana tindakan: Rp ${action.amount.toLocaleString("id-ID")}.`,
    ];

    if (initialBalance !== null) {
      deterministicFacts.push(
        `Saldo yang disampaikan pengguna: Rp ${initialBalance.toLocaleString("id-ID")}.`,
        `Sisa saldo setelah tindakan: Rp ${balanceAfterAction!.toLocaleString("id-ID")} (${
          canPayAction ? "Saldo mencukupi pembayaran" : "Saldo tidak mencukupi"
        }).`
      );
    } else {
      deterministicFacts.push(
        `Saldo kas belum dibagikan pengguna (status kecukupan pembayaran: tidak diketahui).`
      );
    }

    if (userProvided.budget !== undefined) {
      deterministicFacts.push(
        `Anggaran yang disampaikan pengguna: Rp ${userProvided.budget.toLocaleString("id-ID")} (${
          isBudgetExceeded
            ? `Melebihi anggaran Rp ${Math.abs(budgetVariance!).toLocaleString("id-ID")}`
            : `Mencukupi anggaran dengan sisa Rp ${budgetVariance!.toLocaleString("id-ID")}`
        }).`
      );
    }

    if (liabilitiesProvided) {
      deterministicFacts.push(
        `Kewajiban/tagihan yang disampaikan pengguna: Rp ${totalLiabilities.toLocaleString("id-ID")}.`,
        `Sisa dana setelah tagihan: Rp ${remainingCashAfterImmediateObligations!.toLocaleString(
          "id-ID"
        )} (${
          canCoverObligations ? "Tagihan tercukupi" : `Defisit Rp ${deficitAmount.toLocaleString("id-ID")}`
        }).`
      );
    } else {
      deterministicFacts.push(
        `Kewajiban/tagihan pengguna belum dibagikan (status kecukupan tagihan: tidak diketahui).`
      );
    }

    if (minBuffer !== null) {
      if (isBufferMaintained) {
        deterministicFacts.push(
          `Buffer darurat yang disampaikan (Rp ${minBuffer.toLocaleString(
            "id-ID"
          )}): Terjaga dengan sisa kas Rp ${remainingCashAfterImmediateObligations!.toLocaleString("id-ID")}.`
        );
      } else {
        deterministicFacts.push(
          `Buffer darurat yang disampaikan (Rp ${minBuffer.toLocaleString(
            "id-ID"
          )}): BERADA DI BAWAH batas buffer, kekurangan Rp ${bufferShortfall.toLocaleString("id-ID")}.`
        );
      }
    } else {
      deterministicFacts.push(
        `Target buffer dana darurat pengguna belum disampaikan (status buffer: tidak diketahui).`
      );
    }

    deterministicFacts.push(
      `Cakupan kebutuhan harian: Tidak diketahui karena pengguna belum menyampaikan rincian kebutuhan harian.`
    );

    return {
      status: "valid",
      actionAmount: action.amount,
      actionType: action.type,
      initialBalance,
      balanceAfterAction,
      relevantBudget,
      budgetVariance,
      isBudgetExceeded,
      nextIncomeDate: null,
      liabilitiesDueBeforeIncome: [],
      totalLiabilitiesBeforeIncome: totalLiabilities,
      liabilitiesDueAfterIncome: [],
      totalLiabilitiesAfterIncome: 0,
      remainingCashAfterImmediateObligations,
      isLiquidityThreatened,
      deficitAmount,
      canPayAction,
      canCoverObligations,
      canCoverEssentialExpenses: "unknown",
      isBufferMaintained,
      areProtectedAllocationsMaintained: "unknown",
      bufferImpact: {
        minBuffer,
        projectedBufferRemaining,
        bufferShortfall,
        isBufferIntact: isBufferMaintained,
      },
      goalsEvaluation: [],
      goalImpactNotes: isBudgetExceeded
        ? [
            `Nominal melebihi anggaran yang disebutkan pengguna sebesar Rp ${Math.abs(
              budgetVariance!
            ).toLocaleString("id-ID")}.`,
          ]
        : [],
      deterministicFacts,
    };
  }

  // =========================================================================
  // Case C: Basic Assistant with NO user financial info yet
  // =========================================================================
  return {
    status: "needs_clarification",
    clarificationReason:
      "Data saldo kas, sisa anggaran, dan kewajiban belum dibagikan oleh pengguna dalam sesi ini.",
    actionAmount: action.amount,
    actionType: action.type,
    initialBalance: null,
    balanceAfterAction: null,
    relevantBudget: null,
    budgetVariance: null,
    isBudgetExceeded: false,
    nextIncomeDate: null,
    liabilitiesDueBeforeIncome: [],
    totalLiabilitiesBeforeIncome: 0,
    liabilitiesDueAfterIncome: [],
    totalLiabilitiesAfterIncome: 0,
    remainingCashAfterImmediateObligations: null,
    isLiquidityThreatened: false,
    deficitAmount: 0,
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
    deterministicFacts: [
      `Nominal rencana tindakan: Rp ${action.amount.toLocaleString("id-ID")}.`,
      `Jenis tindakan: ${action.type === "spending" ? "Pengeluaran" : "Penyisihan Tabungan"}.`,
      `Target pos/kategori: ${action.targetCategory}.`,
      `Waktu pelaksanaan: ${action.timing}.`,
      `Status data finansial pengguna: Belum tersedia. Saldo kas, tagihan terdekat, dan batas buffer belum diberikan.`,
      `Status kecukupan finansial: Tidak diketahui (unknown) sebelum pengguna memberikan angka saldo/anggaran.`,
    ],
  };
}
