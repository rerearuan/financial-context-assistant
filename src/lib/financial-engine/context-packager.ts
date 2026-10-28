import {
  ConditionType,
  ConversationState,
  FinancialAction,
  FinancialProfileContext,
  ResponsePlan,
  StructuredContextPacket,
  UserConstraints,
  UserProvidedFinances,
} from "./types";
import { calculateFinancialConsequences } from "./calculator";

export interface PackageContextParams {
  condition: ConditionType;
  action: FinancialAction;
  syntheticProfile?: FinancialProfileContext | null;
  userProvidedFinances?: UserProvidedFinances | null;
  userConstraints?: UserConstraints | null;
  conversationState?: ConversationState | null;
  responsePlan?: ResponsePlan | null;
}

/**
 * Packages the structured context strictly adhering to experimental condition rules.
 * Basic condition will NEVER receive synthetic profile data or transaction data.
 */
export function buildStructuredContextPacket(
  params: PackageContextParams
): StructuredContextPacket {
  const {
    condition,
    action,
    syntheticProfile,
    userProvidedFinances,
    userConstraints,
    conversationState,
    responsePlan,
  } = params;

  const resolvedState: ConversationState = conversationState || {
    activePlan: action,
    exploredAlternatives: [],
    userProvidedFacts: userProvidedFinances || {},
    userConstraints: userConstraints || {},
    openClarifications: [],
    confusionCount: 0,
    declinedDiscussion: false,
  };

  const resolvedPlan: ResponsePlan = responsePlan || {
    intentType: "general_impact_query",
    isAlternativeOnly: false,
    simplifyExplanation: (resolvedState.confusionCount || 0) > 0,
    avoidQuestionnaireRepeat: false,
  };

  if (condition === "basic") {
    // Basic Assistant: STRICT ISOLATION. syntheticProfile is ignored completely.
    const calculation = calculateFinancialConsequences(
      action,
      null, // Profile is strictly null for Basic
      userProvidedFinances || null,
      userConstraints || null
    );

    const dataSources: Array<"scenario" | "user_message" | "state_machine"> = ["scenario"];
    if (userProvidedFinances && Object.keys(userProvidedFinances).length > 0) {
      dataSources.push("user_message");
    }
    if (conversationState) {
      dataSources.push("state_machine");
    }

    return {
      condition: "basic",
      action,
      calculation,
      conversationState: resolvedState,
      responsePlan: resolvedPlan,
      availableProfile: userProvidedFinances ? { userProvidedFinances } : null,
      dataSources,
    };
  }

  // Context-Aware Assistant
  const calculation = calculateFinancialConsequences(
    action,
    syntheticProfile || null,
    userProvidedFinances || null,
    userConstraints || null
  );

  const dataSources: Array<"synthetic_profile" | "scenario" | "user_message" | "state_machine"> = [
    "scenario",
    "synthetic_profile",
  ];
  if (userProvidedFinances && Object.keys(userProvidedFinances).length > 0) {
    dataSources.push("user_message");
  }
  if (conversationState) {
    dataSources.push("state_machine");
  }

  return {
    condition: "context_aware",
    action,
    calculation,
    conversationState: resolvedState,
    responsePlan: resolvedPlan,
    availableProfile: syntheticProfile
      ? {
          h0Date: syntheticProfile.h0Date,
          totalCashBalance: syntheticProfile.totalCashBalance,
          liquidBalance: syntheticProfile.liquidBalance,
          allocations: syntheticProfile.allocations,
          budgets: syntheticProfile.budgets,
          liabilities: syntheticProfile.liabilities,
          goals: syntheticProfile.goals,
          buffer: syntheticProfile.buffer,
          routineExpenses: syntheticProfile.routineExpenses,
          incomeSchedule: syntheticProfile.incomeSchedule,
          transactions: syntheticProfile.transactions,
          userProvidedFinances: userProvidedFinances || undefined,
        }
      : null,
    dataSources,
  };
}
