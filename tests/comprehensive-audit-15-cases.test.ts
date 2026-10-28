import { describe, it, expect } from "vitest";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import {
  calculateFinancialConsequences,
  calculateInstallmentDetails,
} from "@/lib/financial-engine/calculator";
import { buildStructuredContextPacket } from "@/lib/financial-engine/context-packager";
import {
  heuristicExtractIntent,
  generateSafeFallbackResponse,
} from "@/lib/gemini";
import { validateAssistantOutput } from "@/lib/financial-engine/output-guardrail";
import {
  FinancialAction,
  FinancialProfileContext,
  UserConstraints,
  ConversationState,
  ResponsePlan,
} from "@/lib/financial-engine/types";

describe("Audit Komprehensif Skripsi - 15 Mandatory Test Cases", () => {
  // Scenario fixtures
  const spendLowPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_low")!;
  const spendHighPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_high")!;
  const saveLowPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "saving_low")!;
  const saveHighPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "saving_high")!;

  // --------------------------------------------------------------------------
  // Kasus 1: Sapaan atau Tes Murni ("HI", "tes")
  // --------------------------------------------------------------------------
  it("Kasus 1: Merespons sapaan atau tes murni secara ramah tanpa menodong data finansial", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const intentHi = heuristicExtractIntent("HI", action);
    const intentTes = heuristicExtractIntent("tes", action);

    expect(intentHi.intentType).toBe("greeting_or_ping");
    expect(intentTes.intentType).toBe("greeting_or_ping");

    const packet = buildStructuredContextPacket({
      condition: "basic",
      action,
      responsePlan: {
        intentType: "greeting_or_ping",
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: false,
        isAlternativeOnly: false,
      },
    });

    const reply = generateSafeFallbackResponse(packet, "HI");
    expect(reply).toMatch(/halo/i);
    expect(reply).not.toContain("berapa saldo rekening");
    expect(reply).not.toContain("total tagihan");
  });

  // --------------------------------------------------------------------------
  // Kasus 2: Penanganan Kebingungan Pengguna
  // --------------------------------------------------------------------------
  it("Kasus 2: Merespons kebingungan pengguna dengan penyederhanaan analogis tanpa jargon", () => {
    const action: FinancialAction = { ...saveHighPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("Maksudnya gimana ya? Saya bingung dan pusing liat angkanya", action);

    expect(intent.intentType).toBe("confusion");

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: saveHighPkg.syntheticProfile,
      responsePlan: {
        intentType: "confusion",
        simplifyExplanation: true,
        avoidQuestionnaireRepeat: false,
        isAlternativeOnly: false,
      },
    });

    const reply = generateSafeFallbackResponse(packet, "Maksudnya gimana ya? Saya bingung");
    expect(reply).toContain("Singkatnya begini");
    expect(reply).toContain("8.000.000");
    expect(reply).toContain("uang belanja");
  });

  // --------------------------------------------------------------------------
  // Kasus 3: Penolakan atau Mengakhiri Diskusi
  // --------------------------------------------------------------------------
  it("Kasus 3: Menghormati penolakan diskusi dengan santun dan menegaskan otonomi pengguna", () => {
    const action: FinancialAction = { ...spendHighPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("Saya rasa sudah cukup, ga butuh bantuan lagi.", action);

    expect(intent.intentType).toBe("decline_discussion");

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: spendHighPkg.syntheticProfile,
      responsePlan: {
        intentType: "decline_discussion",
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: false,
        isAlternativeOnly: false,
      },
    });

    const reply = generateSafeFallbackResponse(packet, "ga butuh bantuan lagi");
    expect(reply).toMatch(/terima kasih/i);
    expect(reply).toContain("Keputusan akhir sepenuhnya berada di tangan Anda");
  });

  // --------------------------------------------------------------------------
  // Kasus 4: Penetapan Batasan Pengguna (Constraint Setting)
  // --------------------------------------------------------------------------
  it("Kasus 4: Menghormati batasan pengguna untuk melindungi pos dana sertifikasi", () => {
    const action: FinancialAction = { ...spendHighPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("Saya tidak mau menyentuh atau mengorbankan dana sertifikasi", action);

    expect(intent.intentType).toBe("constraint_setting");
    expect(intent.userConstraints?.prohibitCertificationFunds).toBe(true);

    const constraints: UserConstraints = { prohibitCertificationFunds: true };
    const result = calculateFinancialConsequences(action, spendHighPkg.syntheticProfile, constraints);

    expect(result.budgetShortfallCoverSource).toBe("operating_cash");
    expect(result.areProtectedAllocationsMaintained).toBe(true);
    expect(
      result.goalsEvaluation.some((g) => g.title.includes("Sertifikasi") && g.isUntouchedAndProtected)
    ).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Kasus 5: Modifikasi Relatif Nominal Tindakan
  // --------------------------------------------------------------------------
  it("Kasus 5: Menghitung perubahan relatif nominal (misal 'kurangi 500 ribu')", () => {
    const action: FinancialAction = { ...saveLowPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("Bagaimana kalau nominalnya dikurangi 500 ribu?", action);

    expect(intent.intentType).toBe("relative_modification");
    expect(intent.relativeDelta).toBe(-500000);

    const newAmount = action.amount + (intent.relativeDelta || 0);
    expect(newAmount).toBe(1500000);

    const result = calculateFinancialConsequences(
      { ...action, amount: newAmount },
      saveLowPkg.syntheticProfile
    );
    expect(result.actionAmount).toBe(1500000);
    expect(result.operatingCashAfterAction).toBe(6500000);
  });

  // --------------------------------------------------------------------------
  // Kasus 6: Perbandingan Cicilan vs Tunai (Spending)
  // --------------------------------------------------------------------------
  it("Kasus 6: Menghitung skema cicilan 12 bulan secara transparan", () => {
    const inst = calculateInstallmentDetails(7000000);

    expect(inst.price).toBe(7000000);
    expect(inst.tenorMonths).toBe(12);
    expect(Math.round(inst.monthlyPrincipal)).toBe(583333);
    expect(Math.round(inst.monthlyFlatInterest)).toBe(84000);
    expect(Math.round(inst.monthlyTotalInstallment)).toBe(667333);
    expect(inst.adminFee).toBe(70000);
    expect(inst.totalPayment12Months).toBe(8078000);
    expect(inst.excessOverCash).toBe(1078000);
  });

  // --------------------------------------------------------------------------
  // Kasus 7: Kondisi Basic Tanpa Data Awal
  // --------------------------------------------------------------------------
  it("Kasus 7: Basic assistant tidak membocorkan angka sintetis dan tidak mengulang kuesioner", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const packet = buildStructuredContextPacket({
      condition: "basic",
      action,
      syntheticProfile: null, // Strict server-side stripping
      conversationState: {
        activePlan: action,
        exploredAlternatives: [],
        userProvidedFacts: {},
        userConstraints: {},
        openClarifications: [],
        confusionCount: 0,
        declinedDiscussion: false,
      },
    });

    expect(packet.calculation.status).toBe("needs_clarification");
    expect(packet.calculation.balanceAfterAction).toBeNull();

    const reply = generateSafeFallbackResponse(packet, "Bagaimana dampaknya?");
    expect(reply).not.toContain("Rp 18.000.000");
    expect(reply).not.toContain("Rp 11.000.000");
  });

  // --------------------------------------------------------------------------
  // Kasus 8: Transisi Basic Saat Pengguna Memberi Fakta Bertahap
  // --------------------------------------------------------------------------
  it("Kasus 8: Basic assistant menghitung secara presisi saat pengguna memberikan data saldo & tagihan", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const packet = buildStructuredContextPacket({
      condition: "basic",
      action,
      syntheticProfile: null,
      userProvidedFinances: {
        balance: 18000000,
        liabilities: 1800000,
        buffer: 5000000,
        source: "user_message",
      },
    });

    expect(packet.calculation.status).toBe("valid");
    expect(packet.calculation.balanceAfterAction).toBe(11000000);
    expect(packet.calculation.remainingCashAfterImmediateObligations).toBe(9200000);
    expect(packet.calculation.bufferImpact.minBuffer).toBe(5000000);
    expect(packet.calculation.isBufferMaintained).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Kasus 9: Context-Aware Saving High Conflict
  // --------------------------------------------------------------------------
  it("Kasus 9: Memodelkan Saving High Conflict (Saldo bank tetap Rp 18M, defisit rutin Rp 200k, sertifikasi Rp 0)", () => {
    const action: FinancialAction = { ...saveHighPkg.scenario.initialAction, amount: 2000000, source: "scenario" };
    const result = calculateFinancialConsequences(action, saveHighPkg.syntheticProfile);

    // Mental accounting: total bank balance remains unchanged
    expect(result.balanceAfterAction).toBe(18000000);
    expect(result.netCashFlowImpact).toBe(0);

    // Operating cash & obligations
    expect(result.operatingCashAfterAction).toBe(6000000); // 8M salary - 2M saving
    expect(result.totalLiabilitiesBeforeIncome).toBe(3500000); // 2.4M rent + 600k card + 500k util
    expect(result.remainingCashAfterImmediateObligations).toBe(2500000); // 6M - 3.5M

    // Routine midpoint deficit
    expect(result.routineExpenses?.estimatedRemaining).toBe(2700000);
    expect(result.routineExpenses?.remainingCashAfterRoutine).toBe(-200000); // Defisit 200k
    expect(result.routineExpenses?.isCovered).toBe(false);

    // Certification room is Rp 0
    const certGoal = result.goalsEvaluation.find((g) => g.title.includes("Sertifikasi"));
    expect(certGoal).toBeDefined();
    expect(certGoal?.currentAllocated).toBe(2000000); // Existing 2M remains intact
  });

  // --------------------------------------------------------------------------
  // Kasus 10: Context-Aware Spending Low
  // --------------------------------------------------------------------------
  it("Kasus 10: Memodelkan Spending Low (Alokasi laptop 6M kurang 1M terhadap 7M, sisa kas setelah tagihan 9.2M)", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const result = calculateFinancialConsequences(action, spendLowPkg.syntheticProfile);

    expect(result.balanceAfterAction).toBe(11000000);
    expect(result.netCashFlowImpact).toBe(7000000);
    expect(result.budgetVariance).toBe(-1000000); // Exceeded laptop allocation by 1M
    expect(result.totalLiabilitiesBeforeIncome).toBe(1800000);
    expect(result.remainingCashAfterImmediateObligations).toBe(9200000); // 11M - 1.8M
    expect(result.bufferImpact.minBuffer).toBe(5000000);
    expect(result.isBufferMaintained).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Kasus 11: Context-Aware Spending High
  // --------------------------------------------------------------------------
  it("Kasus 11: Memodelkan Spending High (Alokasi laptop 3M kurang 4M terhadap 7M, dana sertifikasi 3M dilindungi)", () => {
    const action: FinancialAction = { ...spendHighPkg.scenario.initialAction, source: "scenario" };
    const result = calculateFinancialConsequences(action, spendHighPkg.syntheticProfile);

    expect(result.balanceAfterAction).toBe(11000000);
    expect(result.budgetVariance).toBe(-4000000); // Shortfall 4M
    expect(result.totalLiabilitiesBeforeIncome).toBe(1800000);
    expect(result.remainingCashAfterImmediateObligations).toBe(9200000);

    const certGoal = result.goalsEvaluation.find((g) => g.title.includes("Sertifikasi"));
    expect(certGoal?.currentAllocated).toBe(3000000);
    expect(certGoal?.isUntouchedAndProtected).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Kasus 12: Output Guardrail Mencegah Klaim Eksekusi Transaksi
  // --------------------------------------------------------------------------
  it("Kasus 12: Guardrail menolak draf respons yang mengklaim transaksi riil telah dieksekusi", () => {
    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action: spendLowPkg.scenario.initialAction,
      syntheticProfile: spendLowPkg.syntheticProfile,
    });

    const fakeExecutionText =
      "Pembelian laptop Rp 7.000.000 telah berhasil dieksekusi. Dana telah didebit dari rekening Anda.";
    const guardrail = validateAssistantOutput(fakeExecutionText, packet);

    expect(guardrail.isValid).toBe(false);
    expect(guardrail.metrics.claimsTransactionExecuted).toBe(true);
    expect(guardrail.violations.some((v) => v.includes("Klaim eksekusi transaksi"))).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Kasus 13: Output Guardrail Memvalidasi Grounding Angka
  // --------------------------------------------------------------------------
  it("Kasus 13: Guardrail menandai angka halusinasi di luar data terverifikasi", () => {
    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action: spendLowPkg.scenario.initialAction,
      syntheticProfile: spendLowPkg.syntheticProfile,
    });

    const hallucinatedText =
      "Setelah pembelian laptop, saldo tersisa Rp 11.000.000 dan Anda mendapat cashback Rp 999.000 dengan biaya tambahan Rp 450.000.";
    const guardrail = validateAssistantOutput(hallucinatedText, packet);

    expect(guardrail.isValid).toBe(false);
    expect(guardrail.metrics.ungroundedAmounts).toContain(999000);
    expect(guardrail.metrics.ungroundedAmounts).toContain(450000);
  });

  // --------------------------------------------------------------------------
  // Kasus 14: Mental Accounting Invariants
  // --------------------------------------------------------------------------
  it("Kasus 14: Menegakkan invarian bahwa penambahan tabungan internal tidak mengurangi saldo bank", () => {
    for (const testAmount of [1000000, 2000000, 3000000]) {
      const action: FinancialAction = {
        type: "saving",
        amount: testAmount,
        timing: "Bulan ini",
        targetCategory: "Dana Darurat",
        description: `Setoran tabungan ${testAmount}`,
        source: "scenario",
      };

      const result = calculateFinancialConsequences(action, saveLowPkg.syntheticProfile);

      // Invariant 1: Total bank balance remains identical
      expect(result.balanceAfterAction).toBe(saveLowPkg.syntheticProfile.totalCashBalance);
      // Invariant 2: Net cash flow to outside parties is 0
      expect(result.netCashFlowImpact).toBe(0);
      // Invariant 3: Operating cash reduces by exactly action amount
      expect(result.operatingCashAfterAction).toBe(
        (saveLowPkg.syntheticProfile.allocations?.operating || 8000000) - testAmount
      );
    }
  });

  // --------------------------------------------------------------------------
  // Kasus 15: Single Source of Truth & Zero Hallucination
  // --------------------------------------------------------------------------
  it("Kasus 15: Single Source of Truth - perhitungan deterministik menghasilkan snapshot identik tanpa drift", () => {
    const action: FinancialAction = { ...spendHighPkg.scenario.initialAction, source: "scenario" };

    const run1 = calculateFinancialConsequences(action, spendHighPkg.syntheticProfile);
    const run2 = calculateFinancialConsequences(action, spendHighPkg.syntheticProfile);
    const run3 = calculateFinancialConsequences(action, spendHighPkg.syntheticProfile);

    expect(run1).toEqual(run2);
    expect(run2).toEqual(run3);
    expect(run1.balanceAfterAction).toBe(11000000);
    expect(run1.budgetVariance).toBe(-4000000);
    expect(run1.totalLiabilitiesBeforeIncome).toBe(1800000);
    expect(run1.remainingCashAfterImmediateObligations).toBe(9200000);
  });
});
