import { describe, it, expect } from "vitest";
import {
  validateAssistantOutput,
  extractMentionedAmounts,
} from "@/lib/financial-engine/output-guardrail";
import { StructuredContextPacket } from "@/lib/financial-engine/types";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { buildStructuredContextPacket } from "@/lib/financial-engine/context-packager";

describe("AI Architecture Guardrails - Output Guardrail", () => {
  const highPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_high")!;
  
  // Standard context-aware packet with 7M action (balance 18M, after action 11M, budget variance -4M)
  const contextAwarePacket: StructuredContextPacket = buildStructuredContextPacket({
    condition: "context_aware",
    action: {
      type: "spending",
      amount: 7000000,
      timing: "Hari ini",
      targetCategory: "Pembelian Laptop",
      description: "Membeli laptop baru",
      source: "scenario",
    },
    syntheticProfile: {
      ...highPkg.syntheticProfile,
      source: "synthetic_profile",
    },
  });

  // Deficit packet: 20M action on 18M balance -> balanceAfterAction -2M, liabilities 1.8M -> deficit 3.8M
  const deficitPacket: StructuredContextPacket = buildStructuredContextPacket({
    condition: "context_aware",
    action: {
      type: "spending",
      amount: 20000000,
      timing: "Hari ini",
      targetCategory: "Pembelian Laptop",
      description: "Membeli laptop premium baru",
      source: "user_message",
    },
    syntheticProfile: {
      ...highPkg.syntheticProfile,
      source: "synthetic_profile",
    },
  });

  const basicPacket: StructuredContextPacket = buildStructuredContextPacket({
    condition: "basic",
    action: {
      type: "spending",
      amount: 7000000,
      timing: "Hari ini",
      targetCategory: "Pembelian Laptop",
      description: "Membeli laptop baru",
      source: "scenario",
    },
    syntheticProfile: null,
  });

  it("extracts mentioned currency amounts correctly", () => {
    const text =
      "Pembelian sebesar Rp 7.000.000 dengan saldo Rp 18.000.000 dan sisa anggaran 3jt serta pengeluaran 1 juta.";
    const amounts = extractMentionedAmounts(text);
    expect(amounts).toContain(7000000);
    expect(amounts).toContain(18000000);
    expect(amounts).toContain(3000000);
    expect(amounts).toContain(1000000);
  });

  it("flags responses containing forbidden research terms (Batas Eksperimen)", () => {
    const invalidText =
      "Berdasarkan MAC dan hipotesis penelitian kami pada syntheticProfile ini, pengeluaran ini berisiko.";
    const result = validateAssistantOutput(invalidText, contextAwarePacket);

    expect(result.isValid).toBe(false);
    expect(result.metrics.forbiddenTermsDetected.length).toBeGreaterThan(0);
    expect(result.violations.some((v) => v.includes("istilah penelitian terlarang"))).toBe(true);
  });

  it("flags responses claiming 'aman' or 'tanpa risiko' when liquidity is threatened (Defisit)", () => {
    expect(deficitPacket.calculation.isLiquidityThreatened).toBe(true);
    expect(deficitPacket.calculation.deficitAmount).toBe(3800000);

    const invalidText =
      "Keputusan ini sangat aman dan kondisi keuangan Anda tanpa kendala jika membeli laptop Rp 20.000.000.";
    const result = validateAssistantOutput(invalidText, deficitPacket);

    expect(result.isValid).toBe(false);
    expect(result.metrics.contradictorySafetyClaims).toBe(true);
    expect(result.violations.some((v) => v.includes("Klaim keamanan berkontradiksi"))).toBe(true);
  });

  it("flags responses claiming 'masih dalam batas anggaran' when budget is exceeded", () => {
    expect(contextAwarePacket.calculation.isBudgetExceeded).toBe(true);

    const invalidText =
      "Pembelian ini masih dalam batas anggaran dan sisa saldo kas Anda Rp 11.000.000.";
    const result = validateAssistantOutput(invalidText, contextAwarePacket);

    expect(result.isValid).toBe(false);
    expect(result.metrics.contradictoryBudgetCliams).toBe(true);
    expect(result.violations.some((v) => v.includes("Klaim anggaran berkontradiksi"))).toBe(true);
  });

  it("flags ungrounded/hallucinated large Rupiah figures", () => {
    // 85.000.000 is not in the context packet
    const invalidText =
      "Pembelian laptop Rp 7.000.000 akan mempengaruhi dana cadangan Anda sebesar Rp 85.000.000.";
    const result = validateAssistantOutput(invalidText, contextAwarePacket);

    expect(result.isValid).toBe(false);
    expect(result.metrics.ungroundedAmounts).toContain(85000000);
    expect(result.violations.some((v) => v.includes("tidak berdasar"))).toBe(true);
  });

  it("flags Basic condition responses claiming specific remaining balance when data is missing", () => {
    const invalidBasicText =
      "Jika Anda membeli laptop seharga Rp 7.000.000, maka saldo Anda tersisa Rp 5.000.000.";
    const result = validateAssistantOutput(invalidBasicText, basicPacket);

    expect(result.isValid).toBe(false);
    expect(result.violations.some((v) => v.includes("Kondisi Basic tanpa data"))).toBe(true);
  });

  it("passes valid, factually grounded responses without violations", () => {
    const validText =
      "Rencana pembelian laptop sebesar Rp 7.000.000 akan mengurangi saldo kas operasional Anda dari Rp 18.000.000 menjadi Rp 11.000.000. " +
      "Tindakan ini melebihi pos anggaran Dana Alokasi Laptop sebesar Rp 4.000.000. " +
      "Selain itu, terdapat kewajiban tagihan sebesar Rp 1.800.000 sebelum tanggal gajian, dengan sisa kas likuid Rp 9.200.000. " +
      "Anda dapat mempertimbangkan opsi untuk Lanjut, Ubah nominal, atau Tunda.";

    const result = validateAssistantOutput(validText, contextAwarePacket);
    expect(result.isValid).toBe(true);
    expect(result.violations.length).toBe(0);
  });
});
