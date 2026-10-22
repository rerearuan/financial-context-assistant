export type ActionType = "spending" | "saving";
export type ConditionType = "basic" | "context_aware";

export interface FinancialAction {
  type: ActionType;
  amount: number;
  timing: string;
  targetCategory: string;
  description: string;
  source: "scenario" | "user_message";
}

export interface BudgetItem {
  category: string;
  allocated: number;
  spentSoFar: number;
  remaining: number;
  source: "synthetic_profile" | "user_message";
}

export interface LiabilityItem {
  title: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  isPriority: boolean;
  source: "synthetic_profile" | "user_message";
}

export interface GoalItem {
  title: string;
  targetAmount: number;
  currentAllocated: number;
  targetDate?: string;
  priority: "high" | "medium" | "low";
  lockIn: boolean;
  source: "synthetic_profile" | "user_message";
}

export interface BufferItem {
  name: string;
  minAmount: number;
  currentAmount: number;
  source: "synthetic_profile" | "user_message";
}

export interface IncomeScheduleItem {
  sourceName: string;
  amount: number;
  nextDate: string; // YYYY-MM-DD
  regularity: string;
  source: "synthetic_profile" | "user_message";
}

export interface FinancialProfileContext {
  totalCashBalance: number;
  liquidBalance: number;
  budgets: BudgetItem[];
  liabilities: LiabilityItem[];
  goals: GoalItem[];
  buffer: BufferItem;
  incomeSchedule: IncomeScheduleItem;
  source: "synthetic_profile";
}

export interface UserProvidedFinances {
  balance?: number;
  budget?: number;
  income?: number;
  liabilities?: number;
  goals?: string;
  source: "user_message";
}

export interface FinancialCalculationResult {
  status: "valid" | "needs_clarification";
  clarificationReason?: string;
  actionAmount: number;
  actionType: ActionType;
  
  // Balances
  initialBalance: number | null;
  balanceAfterAction: number | null;
  
  // Budget
  relevantBudget: BudgetItem | null;
  budgetVariance: number | null; // positive = surplus, negative = deficit
  isBudgetExceeded: boolean;
  
  // Liabilities & Horizon
  nextIncomeDate: string | null;
  liabilitiesDueBeforeIncome: LiabilityItem[];
  totalLiabilitiesBeforeIncome: number;
  liabilitiesDueAfterIncome: LiabilityItem[];
  totalLiabilitiesAfterIncome: number;
  
  // Liquidity & Buffers
  remainingCashAfterImmediateObligations: number | null;
  isLiquidityThreatened: boolean;
  deficitAmount: number;
  
  // Goals & Buffer impacts
  bufferImpact: {
    minBuffer: number | null;
    projectedBufferRemaining: number | null;
    isBufferIntact: boolean;
  };
  goalImpactNotes: string[];

  // Deterministic summary statements for LLM grounding
  deterministicFacts: string[];
}

export interface StructuredContextPacket {
  condition: ConditionType;
  action: FinancialAction;
  calculation: FinancialCalculationResult;
  availableProfile: {
    totalCashBalance?: number;
    liquidBalance?: number;
    budgets?: BudgetItem[];
    liabilities?: LiabilityItem[];
    goals?: GoalItem[];
    buffer?: BufferItem;
    incomeSchedule?: IncomeScheduleItem;
    userProvidedFinances?: UserProvidedFinances;
  } | null;
  dataSources: Array<"synthetic_profile" | "scenario" | "user_message">;
}
