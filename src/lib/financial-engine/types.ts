export type ActionType = "spending" | "saving";
export type ConditionType = "basic" | "context_aware";
export type AssessmentStatus = boolean | "unknown";

export interface BankTransactionItem {
  id?: string;
  transactionId?: string;
  transaction_id?: string;
  date: string; // YYYY-MM-DD
  description: string;
  category: string;
  amount?: number;
  credit?: number;
  debit?: number;
  balance?: number;
  runningBalance?: number;
  type?: "credit" | "debit";
}

export interface FinancialAction {
  type: ActionType;
  amount: number; // 0 or positive; 0 indicates not yet selected (e.g. saving baseline)
  timing: string;
  targetCategory: string;
  description: string;
  source: "scenario" | "user_message" | "alternative_exploration";
  modifiedByUser?: boolean;
  paymentMethod?: "cash" | "installment";
  tenorMonths?: number;
}

export interface BudgetItem {
  category: string;
  allocated: number;
  spentSoFar: number;
  remaining: number;
  source: "synthetic_profile" | "user_message";
}

export interface LiabilityItem {
  id?: string;
  title: string;
  amount: number;
  amountMin?: number;
  amountMax?: number;
  dueDate: string | null; // YYYY-MM-DD or null if estimated/no fixed date
  isPriority: boolean;
  status?: "unpaid" | "estimated" | "paid";
  period?: string;
  source: "synthetic_profile" | "user_message";
}

export interface GoalItem {
  id?: string;
  title: string;
  targetAmount: number;
  currentAllocated: number;
  targetDate?: string;
  priority: "high" | "medium" | "low";
  lockIn: boolean; // if true, funds in this goal cannot be liquidated immediately without penalty
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

export interface RoutineExpensesContext {
  monthlyEstimate: number;
  spentSoFar?: number;
  remainingEstimate: number;
  range?: { min: number; max: number };
  source: "synthetic_profile" | "user_message";
}

export interface FinancialProfileContext {
  id?: string;
  scenarioId?: string;
  h0Date?: string; // YYYY-MM-DD
  totalCashBalance: number;
  liquidBalance: number;
  allocations?: Record<string, number>;
  budgets: BudgetItem[];
  liabilities: LiabilityItem[];
  goals: GoalItem[];
  buffer: BufferItem;
  routineExpenses?: RoutineExpensesContext;
  incomeSchedule: IncomeScheduleItem;
  historyMonths?: string[];
  routineMonthlyTotals?: number[];
  transactions?: BankTransactionItem[];
  installmentPlan?: any;
  laptopOffer?: {
    price: number;
    regularPrice: number;
    installmentMonths: number;
    flatInterestMonthly: number;
    adminRate: number;
    firstPaymentDate: string | null;
    adminPaymentDate: string | null;
  };
  emergencyTarget?: number;
  certificationGoal?: {
    costMin: number;
    costMax: number;
    horizonMonths: number[];
  };
  source: "synthetic_profile";
}

export interface UserProvidedFinances {
  balance?: number;
  budget?: number;
  income?: number;
  liabilities?: number;
  buffer?: number;
  routine?: number;
  historicalRoutine?: number;
  spentSoFar?: number;
  emergencyCurrent?: number;
  emergencyTarget?: number;
  goals?: string;
  rawUserFigures?: number[];
  source?: "user_message";
}

export interface UserConstraints {
  prohibitCertificationFunds?: boolean;
  maintainBufferAmount?: number;
  preferredPaymentMethod?: "cash" | "installment";
  preferredTenor?: number;
  otherConstraints?: string[];
}

export interface ExploredAlternative {
  amount: number;
  type: ActionType;
  paymentMethod?: "cash" | "installment";
  tenorMonths?: number;
  label?: string;
  calculationSnapshot?: FinancialCalculationResult;
  timestamp: string;
}

export interface ConversationState {
  activePlan: FinancialAction | null;
  exploredAlternatives: ExploredAlternative[];
  userProvidedFacts: UserProvidedFinances;
  userConstraints: UserConstraints;
  lastReferencedEntity?: {
    type: "plan" | "alternative" | "bill" | "budget" | "goal" | "general";
    amount?: number;
    label?: string;
  };
  openClarifications: string[];
  askedClarifications?: string[];
  ignoredClarificationsCount?: number;
  preferBriefResponse?: boolean;
  lengthPreference?: "brief" | "detailed" | "normal";
  localFormatInstruction?:
    | "one_line"
    | "yes_no_amount"
    | "nominal_only"
    | "few_numbers"
    | "no_numbers"
    | "specific_part_only"
    | "detailed"
    | "compare"
    | null;
  userThanked?: boolean;
  confusionCount: number;
  declinedDiscussion: boolean;
}

export interface GoalAllocationCalculation {
  title: string;
  targetAmount: number;
  currentAllocated: number;
  remainingShortfall: number;
  availableSurplusAfterObligations: number | null;
  canMeetGoal: AssessmentStatus;
  isUntouchedAndProtected: boolean;
  explanation: string;
}

export interface InstallmentCalculation {
  price: number;
  tenorMonths: number;
  monthlyPrincipal: number;
  monthlyFlatInterest: number;
  monthlyTotalInstallment: number;
  adminFee: number;
  totalPayment12Months: number;
  excessOverCash: number;
  knownFirstDueDate: string | null;
  knownAdminDueDate: string | null;
}

export interface FinancialCalculationResult {
  status: "valid" | "needs_clarification";
  clarificationReason?: string;
  actionAmount: number;
  actionType: ActionType;
  
  // Balances & Cash Status
  initialBalance: number | null;
  balanceAfterAction: number | null; // For spending: bank cash reduces. For saving: bank cash unchanged (virtual allocation)
  netCashFlowImpact: number; // Actual cash outflow to external parties (spending = amount, saving = 0)
  
  // Virtual Allocations (Mental Accounting)
  virtualAllocationsBefore: Record<string, number>;
  virtualAllocationsAfter: Record<string, number>;
  
  // Operating Cash & Budget
  operatingCashBefore: number | null;
  operatingCashAfterAction: number | null;
  relevantBudget: BudgetItem | null;
  budgetVariance: number | null; // positive = surplus, negative = deficit
  isBudgetExceeded: boolean;
  budgetShortfallCoverSource?: "operating_cash" | "certification_funds" | "uncovered";
  
  // Liabilities & Horizon
  nextIncomeDate: string | null;
  daysToNextIncome: number | null;
  liabilitiesDueBeforeIncome: LiabilityItem[];
  totalLiabilitiesBeforeIncome: number;
  liabilitiesDueAfterIncome: LiabilityItem[];
  totalLiabilitiesAfterIncome: number;
  
  // Liquidity & Cash Flow After Immediate Obligations
  remainingCashAfterImmediateObligations: number | null;
  isLiquidityThreatened: boolean;
  deficitAmount: number;
  
  // Essential Routine Expenses
  routineExpenses: {
    estimatedRemaining: number;
    rangeMin?: number;
    rangeMax?: number;
    isCovered: AssessmentStatus;
    remainingCashAfterRoutine: number | null; // midpoint
    rangeRemainingMin?: number; // if expenses at max
    rangeRemainingMax?: number; // if expenses at min
  } | null;

  // Emergency Fund Details
  emergencyFundEvaluation?: {
    currentAccumulated: number;
    targetAmount: number;
    newAccumulated: number;
    remainingShortfall: number;
    percentageOfTarget: number;
  } | null;

  // Installment Details (if applicable)
  installmentDetails?: InstallmentCalculation | null;

  // Separated Evaluation Statuses (Granular Financial Dimensions)
  canPayAction: AssessmentStatus;
  canCoverObligations: AssessmentStatus;
  canCoverEssentialExpenses: AssessmentStatus;
  isBufferMaintained: AssessmentStatus;
  areProtectedAllocationsMaintained: AssessmentStatus;

  // Buffer details
  bufferImpact: {
    minBuffer: number | null;
    projectedBufferRemaining: number | null;
    bufferShortfall: number; // 0 if maintained, > 0 if breached
    isBufferIntact: AssessmentStatus;
  };

  // Protected Commitments (e.g., Emergency Buffer + Certification Goal)
  totalProtectedCommitments?: number | null;
  commitmentsShortfall?: number | null;
  isFullyCoveredIncludingAllCommitments?: AssessmentStatus;

  // Baseline & Alternatives (e.g. for saving before deciding amount)
  baselineSurplusBeforeAction?: number | null;
  baselineSurplusRange?: { min: number; max: number } | null;
  alternativesEvaluation?: Array<{
    amount: number;
    label: string;
    remainingCash: number;
    canCoverRoutine: boolean;
    notes: string;
  }>;
  recommendedAmount?: number | null;
  recommendedAmountReason?: string | null;

  // Goals space evaluation
  goalsEvaluation: GoalAllocationCalculation[];
  goalImpactNotes: string[];

  // Assumptions & Unknowns
  statedAssumptions: string[];
  unknownVariables: string[];

  // Deterministic summary statements for LLM grounding
  deterministicFacts: string[];
}

export type IntentType =
  | "inquire"
  | "modify_action"
  | "ask_impact"
  | "clarify_info"
  | "greeting_or_ping"
  | "thank_you"
  | "decline_discussion"
  | "general_impact_query"
  | "specific_aspect_query"
  | "alternative_exploration"
  | "action_modification"
  | "relative_modification"
  | "constraint_setting"
  | "advice_request"
  | "request_nominal_calculation"
  | "conceptual_question"
  | "confusion"
  | "fact_provision_or_correction"
  | "final_decision"
  | "out_of_scope"
  | "other";

export interface ResponsePlan {
  intentType: IntentType;
  focalDimension?: "liquidity" | "bills" | "routine" | "buffer" | "goals" | "installment" | "alternatives" | "general";
  isAlternativeOnly: boolean;
  comparedAmounts?: number[];
  simplifyExplanation: boolean;
  avoidQuestionnaireRepeat: boolean;
  honoredConstraints?: string[];
  clarificationToAsk?: string | null;
  hasUserDisclosedAction?: boolean;
  preferBriefResponse?: boolean;
  lengthPreference?: "brief" | "detailed" | "normal";
  localFormatInstruction?:
    | "one_line"
    | "yes_no_amount"
    | "nominal_only"
    | "few_numbers"
    | "no_numbers"
    | "specific_part_only"
    | "detailed"
    | "compare"
    | null;
  requestingNominalRecommendation?: boolean;
  shouldCloseConversation?: boolean;
  isThankYouWithNewQuestion?: boolean;
  isConceptualQuestion?: boolean;
}

export interface StructuredContextPacket {
  condition: ConditionType;
  action: FinancialAction;
  calculation: FinancialCalculationResult;
  conversationState: ConversationState;
  responsePlan: ResponsePlan;
  hasUserDisclosedAction?: boolean;
  availableProfile: {
    h0Date?: string;
    totalCashBalance?: number;
    liquidBalance?: number;
    allocations?: Record<string, number>;
    budgets?: BudgetItem[];
    liabilities?: LiabilityItem[];
    goals?: GoalItem[];
    buffer?: BufferItem;
    routineExpenses?: RoutineExpensesContext;
    incomeSchedule?: IncomeScheduleItem;
    transactions?: BankTransactionItem[];
    userProvidedFinances?: UserProvidedFinances;
  } | null;
  dataSources: Array<"synthetic_profile" | "scenario" | "user_message" | "state_machine">;
}
