import { describe, it, expect } from "vitest";
import { calculateFinancialConsequences, calculateInstallmentDetails } from "@/lib/financial-engine/calculator";
import { heuristicExtractIntent, generateSafeFallbackResponse } from "@/lib/gemini";
import { buildStructuredContextPacket } from "@/lib/financial-engine/context-packager";
import { validateAssistantOutput } from "@/lib/financial-engine/output-guardrail";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { FinancialAction, FinancialProfileContext, UserConstraints } from "@/lib/financial-engine/types";

describe("Verifikasi Komprehensif Perbaikan Chatbot Riset (14 Kriteria Penerimaan)", () => {
  const spendLowPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_low")!;
  const spendHighPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_high")!;
  const saveLowPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "saving_low")!;
  const saveHighPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "saving_high")!;

  // 1. Basic Multi-Fact Extraction
  it("Kriteria 1: Basic mengekstraksi multi-fakta dalam satu pesan tanpa menimpa nominal tindakan", () => {
    const action: FinancialAction = {
      type: "saving",
      amount: 0,
      timing: "Bulan ini",
      targetCategory: "Penambahan Tabungan Dana Darurat",
      description: "Tabungan",
      source: "scenario",
    };
    const msg = "Saldo saya 16 juta, termasuk dana darurat 8 juta dari target 12 juta, gaji 8 juta, tagihan 3.5 juta, dan pengeluaran biasanya 2.7 juta.";
    const intent = heuristicExtractIntent(msg, action);

    expect(intent.userProvidedFinances).toBeDefined();
    expect(intent.userProvidedFinances?.balance).toBe(16000000);
    expect(intent.userProvidedFinances?.buffer).toBe(8000000);
    expect(intent.userProvidedFinances?.emergencyTarget).toBe(12000000);
    expect(intent.userProvidedFinances?.income).toBe(8000000);
    expect(intent.userProvidedFinances?.liabilities).toBe(3500000);
    expect(intent.userProvidedFinances?.routine).toBe(2700000);
    expect(intent.newAmount).toBeNull(); // Tidak menimpa action nominal
  });

  // 2. Basic Natural Parsing: "pengeluaranku biasanya 3 juta"
  it("Kriteria 2: Basic mengenali variasi bahasa pengeluaran 'pengeluaranku biasanya 3 juta' dan tidak memicu penolakan guardrail", () => {
    const action: FinancialAction = {
      type: "spending",
      amount: 7000000,
      timing: "Hari ini",
      targetCategory: "Pembelian Laptop",
      description: "Laptop",
      source: "scenario",
    };
    const msg = "ooh maaf, pengeluaranku biasanya 3 juta";
    const intent = heuristicExtractIntent(msg, action);

    expect(intent.userProvidedFinances?.routine).toBe(3000000);
    expect(intent.userProvidedFinances?.rawUserFigures).toContain(3000000);

    const packet = buildStructuredContextPacket({
      condition: "basic",
      action,
      syntheticProfile: null,
      userProvidedFinances: {
        balance: 18000000,
        routine: 3000000,
        rawUserFigures: [3000000],
      },
    });

    expect(packet.calculation.status).toBe("valid");
    expect(packet.calculation.balanceAfterAction).toBe(11000000);
    expect(packet.calculation.routineExpenses?.remainingCashAfterRoutine).toBe(8000000);

    // Guardrail validation test on response mentioning 3.000.000
    const assistantDraft = "Pengeluaran rutin Anda sekitar Rp 3.000.000 sudah dicatat. Setelah pembelian laptop Rp 7.000.000 dari saldo Rp 18.000.000, sisa kas Anda setelah kebutuhan rutin adalah Rp 8.000.000.";
    const guardrail = validateAssistantOutput(assistantDraft, packet);
    expect(guardrail.isValid).toBe(true);
    expect(guardrail.violations).toHaveLength(0);
  });

  // 3. Basic No Repeated Nagging
  it("Kriteria 3: Basic tidak menodong saldo berulang kali saat pengguna menanyakan pertimbangan konseptual", () => {
    const action: FinancialAction = {
      type: "spending",
      amount: 7000000,
      timing: "Hari ini",
      targetCategory: "Pembelian Laptop",
      description: "Laptop",
      source: "scenario",
    };
    const packet = buildStructuredContextPacket({
      condition: "basic",
      action,
      syntheticProfile: null,
      responsePlan: {
        intentType: "conceptual_question" as any,
        focalDimension: "general",
        isAlternativeOnly: false,
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: true,
        hasUserDisclosedAction: true,
      },
    });

    const reply = generateSafeFallbackResponse(packet, "Jawab singkat dulu, pertimbangan utamanya apa?", [
      { role: "assistant", content: "Halo! Saya asisten finansial Anda." },
      { role: "user", content: "Saya mau beli laptop Rp7 juta untuk kerja. Kira-kira saya bisa beli sekarang?" },
      { role: "assistant", content: "Pembelian laptop Rp 7.000.000 mengurangi saldo Anda..." },
    ]);

    expect(reply).toMatch(/pertimbangan utamanya/i);
    expect(reply).not.toContain("silakan bagikan perkiraan saldo rekening Anda saat ini dan total tagihan");
  });

  // 4. Spending High: Shortfall Rp 600.000 dan Proteksi Ganda
  it("Kriteria 4: Spending High mendeteksi shortfall Rp 600.000 antara sisa kas (7.4M) vs total proteksi (5M buffer + 3M cert = 8M)", () => {
    const action: FinancialAction = {
      type: "spending",
      amount: 7000000,
      timing: "Hari ini",
      targetCategory: "Pembelian Laptop",
      description: "Laptop",
      source: "scenario",
    };
    const result = calculateFinancialConsequences(action, spendHighPkg.syntheticProfile);

    expect(result.initialBalance).toBe(18000000);
    expect(result.balanceAfterAction).toBe(11000000);
    expect(result.totalLiabilitiesBeforeIncome).toBe(1800000);
    expect(result.remainingCashAfterImmediateObligations).toBe(9200000);
    expect(result.routineExpenses?.remainingCashAfterRoutine).toBe(7400000);

    // Total protected commitments = 5M (darurat) + 3M (sertifikasi) = 8M
    expect(result.totalProtectedCommitments).toBe(8000000);
    expect(result.commitmentsShortfall).toBe(600000);
    expect(result.isFullyCoveredIncludingAllCommitments).toBe(false);

    // Guardrail rejects claiming 'sangat aman' in Spending High
    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: spendHighPkg.syntheticProfile,
    });
    const unsafeDraft = "Pembelian laptop Rp 7.000.000 ini sangat aman dan kedua pos terlindungi utuh.";
    const guardrail = validateAssistantOutput(unsafeDraft, packet);
    expect(guardrail.isValid).toBe(false);
    expect(guardrail.violations.some((v) => v.includes("Klaim keamanan berkontradiksi"))).toBe(true);
  });

  // 5. Saving Low & High: Baseline Surplus 1.8M dan Evaluasi Alternatif
  it("Kriteria 5: Saving menghitung baseline surplus Rp 1.8M sebelum tabungan disetor dan merekomendasikan Rp 1.000.000", () => {
    const action: FinancialAction = {
      type: "saving",
      amount: 0, // Baseline sebelum memilih angka
      timing: "Bulan ini",
      targetCategory: "Penambahan Tabungan Dana Darurat",
      description: "Evaluasi tabungan",
      source: "scenario",
    };
    const result = calculateFinancialConsequences(action, saveLowPkg.syntheticProfile);

    expect(result.baselineSurplusBeforeAction).toBe(1800000);
    expect(result.baselineSurplusRange?.min).toBe(1500000);
    expect(result.baselineSurplusRange?.max).toBe(2100000);

    // Alternatives: 1M (surplus 800k), 2M (defisit 200k), 3M (defisit 1.2M)
    expect(result.alternativesEvaluation).toBeDefined();
    const alt1M = result.alternativesEvaluation?.find((a) => a.amount === 1000000);
    const alt2M = result.alternativesEvaluation?.find((a) => a.amount === 2000000);
    expect(alt1M?.remainingCash).toBe(800000);
    expect(alt1M?.canCoverRoutine).toBe(true);
    expect(alt2M?.remainingCash).toBe(-200000);
    expect(alt2M?.canCoverRoutine).toBe(false);

    expect(result.recommendedAmount).toBe(1000000);
  });

  // 6. User Requesting Nominal Recommendation: Chatbot suggests 1M without re-asking
  it("Kriteria 6: Pengguna meminta rekomendasi nominal ('kamu yang hitung') ditanggapi dengan rekomendasi aman Rp 1M", () => {
    const action: FinancialAction = {
      type: "saving",
      amount: 0,
      timing: "Bulan ini",
      targetCategory: "Penambahan Tabungan Dana Darurat",
      description: "Tabungan",
      source: "scenario",
    };
    const intent = heuristicExtractIntent("saya bingung mau nabung berapa, kamu yang hitung berapa yang aman", action);
    expect(["advice_request", "request_nominal_calculation"]).toContain(intent.intentType);
    expect(intent.newAmount).toBeNull();

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: saveLowPkg.syntheticProfile,
      responsePlan: {
        intentType: "advice_request",
        focalDimension: "general",
        isAlternativeOnly: false,
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: false,
        hasUserDisclosedAction: true,
        requestingNominalRecommendation: true,
      },
    });

    const reply = generateSafeFallbackResponse(packet, "saya bingung mau nabung berapa, kamu yang hitung berapa yang aman");
    expect(reply).toContain("1.800.000");
    expect(reply).toContain("1.000.000");
    expect(reply).toContain("2.000.000");
    expect(reply).toContain("defisit");
  });

  // 7. Brevity Requests
  it("Kriteria 7: Permintaan jawaban singkat direspons dengan padat dan to-the-point", () => {
    const action: FinancialAction = {
      type: "spending",
      amount: 7000000,
      timing: "Hari ini",
      targetCategory: "Pembelian Laptop",
      description: "Laptop",
      source: "scenario",
    };
    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: spendLowPkg.syntheticProfile,
      responsePlan: {
        intentType: "general_impact_query",
        focalDimension: "general",
        isAlternativeOnly: false,
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: false,
        hasUserDisclosedAction: true,
        preferBriefResponse: true,
      },
    });

    const reply = generateSafeFallbackResponse(packet, "jawab singkat dulu, pertimbangan utamanya apa?");
    expect(reply.length).toBeLessThan(180);
    expect(reply).toMatch(/pertimbangan utamanya adalah/i);
  });

  // 8. Basic Does Not Leak Merchant Installment Terms
  it("Kriteria 8: Basic tidak membocorkan detail skenario cicilan toko (12 bulan, 1.2% flat, 1% admin) bila belum disampaikan pengguna", () => {
    const action: FinancialAction = {
      type: "spending",
      amount: 7000000,
      timing: "Hari ini",
      targetCategory: "Pembelian Laptop",
      description: "Laptop",
      source: "scenario",
    };
    const packet = buildStructuredContextPacket({
      condition: "basic",
      action,
      syntheticProfile: null,
    });

    // In Basic, installmentDetails must be null
    expect(packet.calculation.installmentDetails).toBeNull();

    // Guardrail rejects draft in Basic leaking synthetic installment specifics
    const leakyDraft = "Anda bisa mengambil opsi cicilan 12 bulan dengan bunga flat 1,2% per bulan dan biaya administrasi 1% sehingga angsuran Rp 667.333 per bulan.";
    const guardrail = validateAssistantOutput(leakyDraft, packet);
    expect(guardrail.isValid).toBe(false);
    expect(guardrail.violations.some((v) => v.includes("Kondisi Basic membocorkan rincian skenario cicilan"))).toBe(true);
  });

  // 9. Time Horizon Accuracy
  it("Kriteria 9: Perhitungan horison waktu akurat (12 hari untuk spending, 30 hari untuk saving)", () => {
    const spendResult = calculateFinancialConsequences(spendLowPkg.scenario.initialAction, spendLowPkg.syntheticProfile);
    expect(spendResult.daysToNextIncome).toBe(12);

    const saveResult = calculateFinancialConsequences(saveLowPkg.scenario.initialAction, saveLowPkg.syntheticProfile);
    expect(saveResult.daysToNextIncome).toBe(30);
  });

  // 10. Greeting + Substantive Message Not Swallowed as Pure Greeting
  it("Kriteria 10: Pesan yang mengandung sapaan dan pertanyaan substantif tidak dianggap sebagai sapaan murni", () => {
    const action: FinancialAction = spendLowPkg.scenario.initialAction;
    const intent = heuristicExtractIntent("Halo, saya mau tanya apakah laptop 7 juta aman dibeli sekarang?", action);
    expect(intent.intentType).not.toBe("greeting_or_ping");
    expect(["general_impact_query", "specific_aspect_query"]).toContain(intent.intentType);
  });

  // 11. Single Source of Truth
  it("Kriteria 11: Single source of truth - Basic dan Context-Aware menghasilkan nilai yang sama jika input datanya setara", () => {
    const action: FinancialAction = {
      type: "spending",
      amount: 7000000,
      timing: "Hari ini",
      targetCategory: "Pembelian Laptop",
      description: "Laptop",
      source: "scenario",
    };

    // CA with profile
    const caResult = calculateFinancialConsequences(action, spendLowPkg.syntheticProfile);

    // Basic with identical user-provided facts
    const basicResult = calculateFinancialConsequences(action, null, {
      balance: spendLowPkg.syntheticProfile.totalCashBalance,
      liabilities: spendLowPkg.syntheticProfile.liabilities[0].amount,
      buffer: spendLowPkg.syntheticProfile.buffer.minAmount,
      routine: spendLowPkg.syntheticProfile.routineExpenses?.remainingEstimate,
    });

    expect(basicResult.initialBalance).toBe(caResult.initialBalance);
    expect(basicResult.balanceAfterAction).toBe(caResult.balanceAfterAction);
    expect(basicResult.totalLiabilitiesBeforeIncome).toBe(caResult.totalLiabilitiesBeforeIncome);
    expect(basicResult.remainingCashAfterImmediateObligations).toBe(caResult.remainingCashAfterImmediateObligations);
    expect(basicResult.routineExpenses?.remainingCashAfterRoutine).toBe(caResult.routineExpenses?.remainingCashAfterRoutine);
    expect(basicResult.isBufferMaintained).toBe(caResult.isBufferMaintained);
  });

  // 12. Invarian Saldo Menabung
  it("Kriteria 12: Menegakkan invarian bahwa penambahan tabungan internal tidak mengubah saldo kas rekening bank", () => {
    const action: FinancialAction = {
      type: "saving",
      amount: 2000000,
      timing: "Bulan ini",
      targetCategory: "Dana Darurat",
      description: "Tabungan",
      source: "scenario",
    };
    const result = calculateFinancialConsequences(action, saveLowPkg.syntheticProfile);
    expect(result.initialBalance).toBe(16000000);
    expect(result.balanceAfterAction).toBe(16000000);
    expect(result.netCashFlowImpact).toBe(0);
    expect(result.operatingCashBefore).toBe(8000000);
    expect(result.operatingCashAfterAction).toBe(6000000);
  });

  // 13. Guardrail Anti-Transaction Execution
  it("Kriteria 13: Guardrail menolak draf respons yang mengklaim transaksi riil dieksekusi", () => {
    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action: spendLowPkg.scenario.initialAction,
      syntheticProfile: spendLowPkg.syntheticProfile,
    });
    const executedDraft = "Pembelian laptop Rp 7.000.000 Anda telah berhasil diproses di rekening bank.";
    const guardrail = validateAssistantOutput(executedDraft, packet);
    expect(guardrail.isValid).toBe(false);
    expect(guardrail.violations.some((v) => v.includes("Klaim eksekusi transaksi"))).toBe(true);
  });

  // 14. Guardrail Research Term Isolation
  it("Kriteria 14: Guardrail menolak draf respons yang membocorkan istilah penelitian internal", () => {
    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action: spendLowPkg.scenario.initialAction,
      syntheticProfile: spendLowPkg.syntheticProfile,
    });
    const leakedDraft = "Menurut manipulasi kondisi MAC dan profil sintetis, Anda berada di grup eksperimen.";
    const guardrail = validateAssistantOutput(leakedDraft, packet);
    expect(guardrail.isValid).toBe(false);
    expect(guardrail.violations.some((v) => v.includes("istilah penelitian terlarang"))).toBe(true);
  });
});
