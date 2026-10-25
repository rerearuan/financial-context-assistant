import { describe, it, expect } from "vitest";
import { buildStructuredContextPacket } from "@/lib/financial-engine/context-packager";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { FinancialAction, FinancialProfileContext } from "@/lib/financial-engine/types";

describe("Context Packager & Experimental Conditions", () => {
  const pkg = SCENARIO_PACKAGES[0];
  const action: FinancialAction = {
    ...pkg.scenario.initialAction,
    source: "scenario",
  };
  const profileContext: FinancialProfileContext = {
    ...pkg.syntheticProfile,
    source: "synthetic_profile",
  };

  it("CRITICAL RULE: Basic condition NEVER receives initial synthetic profile data", () => {
    const packet = buildStructuredContextPacket({
      condition: "basic",
      action,
      syntheticProfile: profileContext, // even if erroneously passed, it MUST be stripped
    });

    expect(packet.condition).toBe("basic");
    expect(packet.availableProfile).toBeNull();
    expect(packet.dataSources).not.toContain("synthetic_profile");
    expect(packet.dataSources).toEqual(["scenario"]);
    // Since no user info was typed, status must be needs_clarification
    expect(packet.calculation.status).toBe("needs_clarification");
    expect(packet.calculation.initialBalance).toBeNull();
    expect(packet.calculation.balanceAfterAction).toBeNull();
    expect(packet.calculation.relevantBudget).toBeNull();
  });

  it("Basic condition CAN use data typed by user in chat", () => {
    const packet = buildStructuredContextPacket({
      condition: "basic",
      action,
      syntheticProfile: null,
      userProvidedFinances: {
        balance: 10000000,
        budget: 4000000,
        liabilities: 500000,
        source: "user_message",
      },
    });

    expect(packet.condition).toBe("basic");
    expect(packet.dataSources).toContain("user_message");
    expect(packet.dataSources).not.toContain("synthetic_profile");
    expect(packet.calculation.status).toBe("valid");
    expect(packet.calculation.initialBalance).toBe(10000000);
    expect(packet.calculation.balanceAfterAction).toBe(3000000); // 10jt - 7jt
    expect(packet.calculation.budgetVariance).toBe(-3000000); // 4jt - 7jt
    expect(packet.calculation.totalLiabilitiesBeforeIncome).toBe(500000);
    expect(packet.calculation.remainingCashAfterImmediateObligations).toBe(2500000); // 3jt - 500k
  });

  it("Context-Aware condition includes the synthetic profile and calculated ground truth", () => {
    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: profileContext,
    });

    expect(packet.condition).toBe("context_aware");
    expect(packet.availableProfile).not.toBeNull();
    expect(packet.availableProfile?.totalCashBalance).toBe(18000000);
    expect(packet.dataSources).toContain("synthetic_profile");
    expect(packet.dataSources).toContain("scenario");
    expect(packet.calculation.status).toBe("valid");
    expect(packet.calculation.balanceAfterAction).toBe(11000000); // 18jt - 7jt
  });
});
