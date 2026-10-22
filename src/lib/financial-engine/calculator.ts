import {
  FinancialAction,
  FinancialCalculationResult,
  FinancialProfileContext,
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
  // Case A: Context-Aware (Synthetic Profile available)
  if (profile) {
    const selected = selectRelevantFinancialContext(profile, action);
    const initialBalance = profile.totalCashBalance;
    const balanceAfterAction = initialBalance - action.amount;

    let budgetVariance: number | null = null;
    let isBudgetExceeded = false;
    if (selected.relevantBudget) {
      budgetVariance = selected.relevantBudget.remaining - action.amount;
      isBudgetExceeded = budgetVariance < 0;
    }

    const remainingCashAfterImmediateObligations =
      balanceAfterAction - selected.totalLiabilitiesBeforeIncome;
    const isLiquidityThreatened = remainingCashAfterImmediateObligations < 0;
    const deficitAmount = isLiquidityThreatened
      ? Math.abs(remainingCashAfterImmediateObligations)
      : 0;

    // Buffer check
    const minBuffer = profile.buffer?.minAmount || 0;
    const projectedBufferRemaining = Math.max(0, remainingCashAfterImmediateObligations);
    const isBufferIntact =
      remainingCashAfterImmediateObligations >= minBuffer;

    // Goal notes - strictly avoid conflating "budget exceeded" with "definitely using goal fund"
    const goalImpactNotes: string[] = [];
    if (isBudgetExceeded) {
      const excess = Math.abs(budgetVariance!);
      goalImpactNotes.push(
        `Pengeluaran/alokasi melebihi sisa anggaran pos ${selected.relevantBudget?.category || "terkait"} sebesar Rp ${excess.toLocaleString("id-ID")}.`
      );
      if (isLiquidityThreatened) {
        goalImpactNotes.push(
          `Karena sisa kas operasional defisit Rp ${deficitAmount.toLocaleString("id-ID")} menjelang kewajiban terdekat, Anda berisiko terpaksa menggunakan dana cadangan atau mencairkan pos alokasi lain jika tetap melanjutkan nominal ini.`
        );
      } else if (!isBufferIntact) {
        goalImpactNotes.push(
          `Meskipun kewajiban terdekat masih tertutupi, sisa kas setelah tindakan menyentuh batas dana darurat (minimal Rp ${minBuffer.toLocaleString("id-ID")}).`
        );
      } else {
        goalImpactNotes.push(
          `Kelebihan anggaran ini masih tertutupi oleh sisa kas operasional bebas tanpa harus mengambil pos tabungan tujuan teralokasi.`
        );
      }
    }

    // Specific saving consequence (e.g. lock-in)
    if (action.type === "saving") {
      const isLockedGoal = profile.goals.some((g) => g.lockIn);
      if (isLockedGoal || action.targetCategory.toLowerCase().includes("terkunci") || action.targetCategory.toLowerCase().includes("deposito")) {
        goalImpactNotes.push(
          `Penempatan dana pada instrumen terkunci mengurangi likuiditas kas operasional seketika dan tidak dapat ditarik sewaktu-waktu tanpa pinalti sebelum jatuh tempo.`
        );
      }
    }

    // Deterministic factual statements for grounding
    const deterministicFacts: string[] = [
      `Saldo kas saat ini: Rp ${initialBalance.toLocaleString("id-ID")}.`,
      `Nominal rencana tindakan: Rp ${action.amount.toLocaleString("id-ID")}.`,
      `Sisa saldo setelah tindakan: Rp ${balanceAfterAction.toLocaleString("id-ID")}.`,
    ];

    if (selected.relevantBudget) {
      deterministicFacts.push(
        `Sisa anggaran pos ${selected.relevantBudget.category}: Rp ${selected.relevantBudget.remaining.toLocaleString("id-ID")} (Status: ${
          isBudgetExceeded
            ? `Melebihi anggaran sebesar Rp ${Math.abs(budgetVariance!).toLocaleString("id-ID")}`
            : `Sisa anggaran mencukupi dengan surplus Rp ${budgetVariance!.toLocaleString("id-ID")}`
        }).`
      );
    }

    if (selected.liabilitiesDueBeforeIncome.length > 0) {
      const listNames = selected.liabilitiesDueBeforeIncome
        .map((l) => `${l.title} (Rp ${l.amount.toLocaleString("id-ID")}, jatuh tempo ${l.dueDate})`)
        .join(", ");
      deterministicFacts.push(
        `Kewajiban mendesak sebelum pemasukan berikutnya (${selected.nextIncomeDate}): total Rp ${selected.totalLiabilitiesBeforeIncome.toLocaleString("id-ID")} [${listNames}].`
      );
    } else {
      deterministicFacts.push(
        `Tidak ada kewajiban mendesak yang jatuh tempo sebelum pemasukan berikutnya (${selected.nextIncomeDate}).`
      );
    }

    deterministicFacts.push(
      `Sisa dana likuid setelah tindakan dan kewajiban sebelum gaji: Rp ${remainingCashAfterImmediateObligations.toLocaleString("id-ID")} (${
        isLiquidityThreatened
          ? `Terjadi DEFISIT Rp ${deficitAmount.toLocaleString("id-ID")}`
          : "Likuiditas mencukupi"
      }).`
    );

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
      totalLiabilitiesBeforeIncome: selected.totalLiabilitiesBeforeIncome,
      liabilitiesDueAfterIncome: selected.liabilitiesDueAfterIncome,
      totalLiabilitiesAfterIncome: selected.totalLiabilitiesAfterIncome,
      remainingCashAfterImmediateObligations,
      isLiquidityThreatened,
      deficitAmount,
      bufferImpact: {
        minBuffer,
        projectedBufferRemaining,
        isBufferIntact,
      },
      goalImpactNotes,
      deterministicFacts,
    };
  }

  // Case B: Basic Assistant (No synthetic profile provided)
  // Only calculate based on information explicitly typed by the user in conversation!
  if (userProvided && (userProvided.balance !== undefined || userProvided.budget !== undefined)) {
    const initialBalance = userProvided.balance ?? null;
    const balanceAfterAction =
      initialBalance !== null ? initialBalance - action.amount : null;

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
    const remainingCashAfterImmediateObligations =
      balanceAfterAction !== null ? balanceAfterAction - totalLiabilities : null;
    const isLiquidityThreatened =
      remainingCashAfterImmediateObligations !== null
        ? remainingCashAfterImmediateObligations < 0
        : false;
    const deficitAmount = isLiquidityThreatened
      ? Math.abs(remainingCashAfterImmediateObligations!)
      : 0;

    const deterministicFacts: string[] = [
      `Nominal rencana tindakan: Rp ${action.amount.toLocaleString("id-ID")}.`,
    ];
    if (initialBalance !== null) {
      deterministicFacts.push(
        `Saldo yang disampaikan pengguna: Rp ${initialBalance.toLocaleString("id-ID")}.`,
        `Perkiraan sisa saldo setelah tindakan: Rp ${balanceAfterAction!.toLocaleString("id-ID")}.`
      );
    }
    if (budgetVariance !== null) {
      deterministicFacts.push(
        `Anggaran yang disampaikan pengguna: Rp ${userProvided.budget!.toLocaleString("id-ID")} (${
          isBudgetExceeded
            ? `Melebihi anggaran Rp ${Math.abs(budgetVariance).toLocaleString("id-ID")}`
            : `Mencukupi anggaran dengan sisa Rp ${budgetVariance.toLocaleString("id-ID")}`
        }).`
      );
    }
    if (userProvided.liabilities !== undefined) {
      deterministicFacts.push(
        `Kewajiban yang disampaikan pengguna: Rp ${userProvided.liabilities.toLocaleString("id-ID")}.`,
        `Sisa dana setelah kewajiban: Rp ${remainingCashAfterImmediateObligations!.toLocaleString("id-ID")}.`
      );
    }

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
      bufferImpact: {
        minBuffer: null,
        projectedBufferRemaining: null,
        isBufferIntact: true,
      },
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

  // Case C: Basic Assistant with NO user financial info yet
  // Return needs_clarification - DO NOT invent numbers!
  return {
    status: "needs_clarification",
    clarificationReason:
      "Data saldo kas operasional, sisa anggaran, atau kewajiban pengguna belum tersedia dalam sesi ini.",
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
    bufferImpact: {
      minBuffer: null,
      projectedBufferRemaining: null,
      isBufferIntact: true,
    },
    goalImpactNotes: [],
    deterministicFacts: [
      `Nominal rencana tindakan: Rp ${action.amount.toLocaleString("id-ID")}.`,
      `Jenis tindakan: ${action.type === "spending" ? "Pengeluaran" : "Penyisihan Tabungan"}.`,
      `Target pos/kategori: ${action.targetCategory}.`,
      `Waktu: ${action.timing}.`,
      `Catatan: Saldo dan rincian keuangan belum diberikan oleh pengguna. Minta pengguna membagikan saldo atau anggaran jika ingin analisis terperinci.`,
    ],
  };
}
