import { describe, it, expect } from "vitest";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { calculateFinancialConsequences } from "@/lib/financial-engine/calculator";
import { sanitizeAmount, validateFinancialAction } from "@/lib/financial-engine/validator";
import { selectRelevantFinancialContext } from "@/lib/financial-engine/relevant-selector";
import { FinancialAction, FinancialProfileContext } from "@/lib/financial-engine/types";

describe("Financial Engine - Validator", () => {
  it("sanitizes currency strings correctly", () => {
    expect(sanitizeAmount("Rp 3.500.000")).toBe(3500000);
    expect(sanitizeAmount("3.5jt")).toBe(3500000);
    expect(sanitizeAmount("3,5 juta")).toBe(3500000);
    expect(sanitizeAmount("500rb")).toBe(500000);
    expect(sanitizeAmount("2500000")).toBe(2500000);
    expect(sanitizeAmount("invalid text")).toBeNull();
  });

  it("validates financial actions strictly", () => {
    const valid = validateFinancialAction({
      type: "spending",
      amount: 3500000,
      timing: "Minggu ini",
      targetCategory: "Peralatan Kerja",
    });
    expect(valid.isValid).toBe(true);

    const invalid = validateFinancialAction({
      type: "spending",
      amount: -500,
      timing: "",
      targetCategory: "",
    });
    expect(invalid.isValid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });
});

describe("Financial Engine - Deterministic Calculations for 4 Scenarios", () => {
  for (const pkg of SCENARIO_PACKAGES) {
    it(`calculates ground truth correctly for ${pkg.scenario.id} (${pkg.scenario.conflictLevel} conflict)`, () => {
      const action: FinancialAction = {
        type: pkg.scenario.initialAction.type,
        amount: pkg.scenario.initialAction.amount,
        timing: pkg.scenario.initialAction.timing,
        targetCategory: pkg.scenario.initialAction.targetCategory,
        description: pkg.scenario.initialAction.description,
        source: "scenario",
      };

      const profileContext: FinancialProfileContext = {
        ...pkg.syntheticProfile,
        source: "synthetic_profile",
      };

      const result = calculateFinancialConsequences(action, profileContext);

      expect(result.status).toBe("valid");
      expect(result.balanceAfterAction).toBe(pkg.expectedCalculations.balanceAfterAction);
      expect(result.budgetVariance).toBe(pkg.expectedCalculations.budgetVariance);
      expect(result.totalLiabilitiesBeforeIncome).toBe(
        pkg.expectedCalculations.liabilitiesDueBeforeIncome
      );
      expect(result.remainingCashAfterImmediateObligations).toBe(
        pkg.expectedCalculations.remainingCashAfterImmediateObligations
      );
      expect(result.isLiquidityThreatened).toBe(
        pkg.expectedCalculations.isLiquidityThreatened
      );
      expect(result.isBudgetExceeded).toBe(pkg.expectedCalculations.isBudgetExceeded);
      expect(result.deficitAmount).toBe(pkg.expectedCalculations.deficitAmount);
    });
  }

  it("strictly enforces time horizon rule: income after liability due date cannot cover that liability", () => {
    const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_low")!;
    const profileContext: FinancialProfileContext = {
      ...pkg.syntheticProfile,
      source: "synthetic_profile",
    };
    const action: FinancialAction = {
      ...pkg.scenario.initialAction,
      source: "scenario",
    };

    const selected = selectRelevantFinancialContext(profileContext, action);

    // Gaji arrives 2026-11-01.
    // Tagihan 450.000 is due 2026-10-27 (BEFORE gaji) -> must be counted in liabilitiesDueBeforeIncome.
    // Sewa 2.000.000 is due 2026-11-10 (AFTER gaji) -> must NOT be counted in liabilitiesDueBeforeIncome.
    expect(selected.liabilitiesDueBeforeIncome.length).toBe(1);
    expect(selected.liabilitiesDueBeforeIncome[0].amount).toBe(450000);
    expect(selected.liabilitiesDueAfterIncome.length).toBe(1);
    expect(selected.liabilitiesDueAfterIncome[0].amount).toBe(2000000);
  });

  it("avoids double-counting budget and goals", () => {
    const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_high")!;
    const profileContext: FinancialProfileContext = {
      ...pkg.syntheticProfile,
      source: "synthetic_profile",
    };
    const action: FinancialAction = {
      ...pkg.scenario.initialAction,
      source: "scenario",
    };

    const result = calculateFinancialConsequences(action, profileContext);

    // Gadget budget is exceeded by 2.500.000.
    expect(result.isBudgetExceeded).toBe(true);
    expect(result.budgetVariance).toBe(-2500000);
    // Notes distinguish budget excess from definite goal reduction
    expect(
      result.goalImpactNotes.some((n) =>
        n.includes("melebihi sisa anggaran pos Peralatan Kerja & Gadget")
      )
    ).toBe(true);
  });
});
