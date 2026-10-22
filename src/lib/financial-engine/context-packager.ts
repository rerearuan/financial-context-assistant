import {
  ConditionType,
  FinancialAction,
  FinancialCalculationResult,
  FinancialProfileContext,
  StructuredContextPacket,
  UserProvidedFinances,
} from "./types";
import { calculateFinancialConsequences } from "./calculator";

export interface PackageContextParams {
  condition: ConditionType;
  action: FinancialAction;
  syntheticProfile?: FinancialProfileContext | null;
  userProvidedFinances?: UserProvidedFinances | null;
}

/**
 * Packages the structured context strictly adhering to experimental condition rules.
 * Basic condition will NEVER receive synthetic profile data.
 */
export function buildStructuredContextPacket(
  params: PackageContextParams
): StructuredContextPacket {
  const { condition, action, syntheticProfile, userProvidedFinances } = params;

  if (condition === "basic") {
    // Basic Assistant: STRICT ISOLATION. syntheticProfile is ignored completely.
    const calculation = calculateFinancialConsequences(
      action,
      null, // Profile is strictly null for Basic
      userProvidedFinances || null
    );

    const dataSources: Array<"scenario" | "user_message"> = ["scenario"];
    if (userProvidedFinances) {
      dataSources.push("user_message");
    }

    return {
      condition: "basic",
      action,
      calculation,
      availableProfile: userProvidedFinances
        ? { userProvidedFinances }
        : null,
      dataSources,
    };
  }

  // Context-Aware Assistant
  const calculation = calculateFinancialConsequences(
    action,
    syntheticProfile || null,
    userProvidedFinances || null
  );

  const dataSources: Array<"synthetic_profile" | "scenario" | "user_message"> = [
    "scenario",
    "synthetic_profile",
  ];
  if (userProvidedFinances) {
    dataSources.push("user_message");
  }

  return {
    condition: "context_aware",
    action,
    calculation,
    availableProfile: syntheticProfile
      ? {
          totalCashBalance: syntheticProfile.totalCashBalance,
          liquidBalance: syntheticProfile.liquidBalance,
          budgets: syntheticProfile.budgets,
          liabilities: syntheticProfile.liabilities,
          goals: syntheticProfile.goals,
          buffer: syntheticProfile.buffer,
          incomeSchedule: syntheticProfile.incomeSchedule,
          userProvidedFinances: userProvidedFinances || undefined,
        }
      : null,
    dataSources,
  };
}
