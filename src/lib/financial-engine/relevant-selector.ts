import {
  BudgetItem,
  FinancialAction,
  FinancialProfileContext,
  GoalItem,
  LiabilityItem,
} from "./types";

export interface SelectedRelevantContext {
  relevantBudget: BudgetItem | null;
  liabilitiesDueBeforeIncome: LiabilityItem[];
  totalLiabilitiesBeforeIncome: number;
  liabilitiesDueAfterIncome: LiabilityItem[];
  totalLiabilitiesAfterIncome: number;
  relevantGoals: GoalItem[];
  relevantBuffer: FinancialProfileContext["buffer"] | null;
  nextIncomeDate: string | null;
  nextIncomeAmount: number | null;
}

/**
 * Filter and categorize financial information based on the considered action and time horizon.
 */
export function selectRelevantFinancialContext(
  profile: FinancialProfileContext,
  action: FinancialAction
): SelectedRelevantContext {
  // 1. Find matching budget category
  const targetCategoryLower = action.targetCategory.toLowerCase();
  const relevantBudget =
    profile.budgets.find((b) => {
      const catLower = b.category.toLowerCase();
      return (
        catLower.includes(targetCategoryLower) ||
        targetCategoryLower.includes(catLower) ||
        (action.type === "spending" && (catLower.includes("laptop") || catLower.includes("gadget"))) ||
        (action.type === "saving" && (catLower.includes("tabungan") || catLower.includes("pendapatan") || catLower.includes("darurat")))
      );
    }) || null;

  // 2. Classify liabilities strictly relative to the next income date
  // Rule: Income received AFTER a liability due date cannot be used to pay that liability.
  const incomeDateStr = profile.incomeSchedule.nextDate; // e.g. '2026-11-01'
  const incomeDate = new Date(incomeDateStr);

  const liabilitiesDueBeforeIncome: LiabilityItem[] = [];
  const liabilitiesDueAfterIncome: LiabilityItem[] = [];

  let totalLiabilitiesBeforeIncome = 0;
  let totalLiabilitiesAfterIncome = 0;

  for (const liability of profile.liabilities) {
    const dueDate = new Date(liability.dueDate);
    if (dueDate <= incomeDate) {
      liabilitiesDueBeforeIncome.push(liability);
      totalLiabilitiesBeforeIncome += liability.amount;
    } else {
      liabilitiesDueAfterIncome.push(liability);
      totalLiabilitiesAfterIncome += liability.amount;
    }
  }

  // 3. Goals - do not duplicate budget categories as goals
  const relevantGoals = profile.goals.filter((g) => {
    // Only goals that are active
    return g.currentAllocated > 0;
  });

  return {
    relevantBudget,
    liabilitiesDueBeforeIncome,
    totalLiabilitiesBeforeIncome,
    liabilitiesDueAfterIncome,
    totalLiabilitiesAfterIncome,
    relevantGoals,
    relevantBuffer: profile.buffer,
    nextIncomeDate: profile.incomeSchedule.nextDate,
    nextIncomeAmount: profile.incomeSchedule.amount,
  };
}
