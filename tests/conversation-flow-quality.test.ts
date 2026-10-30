import { describe, it, expect } from "vitest";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import {
  heuristicExtractIntent,
  generateSafeFallbackResponse,
} from "@/lib/gemini";
import { buildStructuredContextPacket } from "@/lib/financial-engine/context-packager";
import { FinancialAction, ConversationState } from "@/lib/financial-engine/types";
import { calculateFinancialConsequences } from "@/lib/financial-engine/calculator";

describe("Percakapan & Kualitas Bahasa Chatbot (Basic & Context-Aware)", () => {
  const spendLowPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_low")!;
  const spendHighPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_high")!;
  const saveLowPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "saving_low")!;
  const saveHighPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "saving_high")!;

  // 1. Sapaan pertama
  it("Turn 1: Sapaan pembuka sopan tanpa todongan data kaku", () => {
    const packet = buildStructuredContextPacket({
      condition: "basic",
      action: saveLowPkg.scenario.initialAction,
      responsePlan: {
        intentType: "greeting_or_ping",
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: false,
        isAlternativeOnly: false,
      },
    });
    const reply = generateSafeFallbackResponse(packet, "Halo selamat pagi");
    expect(reply).toMatch(/Halo/i);
    expect(reply).not.toMatch(/berdasarkan evaluasi terhadap rencana/i);
    expect(reply).not.toMatch(/langkah yang sangat baik/i);
    expect(reply).toContain("Anda");
  });

  // 2. Pertanyaan Konseptual
  it("Turn 2: Menjawab pertanyaan konseptual secara jelas tanpa memaksa todongan nominal", () => {
    const action: FinancialAction = { ...saveLowPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("Apa fungsi dana darurat?", action);
    expect(intent.isConceptualQuestion).toBe(true);
    expect(intent.intentType).toBe("conceptual_question");

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: saveLowPkg.syntheticProfile,
      responsePlan: {
        intentType: "conceptual_question",
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: false,
        isAlternativeOnly: false,
      },
    });
    const reply = generateSafeFallbackResponse(packet, "Apa fungsi dana darurat?");
    expect(reply).toContain("bantalan pengaman keuangan");
    expect(reply).not.toContain("Keputusan akhir sepenuhnya berada di tangan Anda");
  });

  // 3. Permintaan Bantuan Hitung Nominal
  it("Turn 3: Membantu menghitung nominal saat pengguna belum tahu berapa (Saving)", () => {
    const action: FinancialAction = { ...saveLowPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("Saya belum tahu berapa, kamu yang hitung.", action);
    expect(intent.intentType).toBe("request_nominal_calculation");

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: saveLowPkg.syntheticProfile,
      responsePlan: {
        intentType: "request_nominal_calculation",
        requestingNominalRecommendation: true,
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: false,
        isAlternativeOnly: false,
      },
    });
    const reply = generateSafeFallbackResponse(packet, "Saya belum tahu berapa, kamu yang hitung.");
    expect(reply).toContain("1.000.000");
    expect(reply).toContain("uang belanja");
    expect(reply).not.toMatch(/langkah yang sangat baik/i);
  });

  // 4. Batasan Pengguna (Constraint Setting)
  it("Turn 4: Mengingat dan menghormati batasan pengguna", () => {
    const action: FinancialAction = { ...spendHighPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("Jangan sentuh dana sertifikasi ya.", action);
    expect(intent.intentType).toBe("constraint_setting");
    expect(intent.userConstraints?.prohibitCertificationFunds).toBe(true);

    const state: ConversationState = {
      activePlan: action,
      exploredAlternatives: [],
      userProvidedFacts: {},
      userConstraints: { prohibitCertificationFunds: true },
      openClarifications: [],
      confusionCount: 0,
      declinedDiscussion: false,
      userThanked: false,
    };

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: spendHighPkg.syntheticProfile,
      conversationState: state,
      responsePlan: {
        intentType: "constraint_setting",
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: false,
        isAlternativeOnly: false,
      },
    });

    const reply = generateSafeFallbackResponse(packet, "Jangan sentuh dana sertifikasi ya.");
    expect(reply).toContain("Batasan Anda dicatat");
    expect(reply).toContain("dilindungi");
  });

  // 5. Format Satu Baris
  it("Turn 5: Mengikuti format instruksi satu baris", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("Jawab satu baris saja.", action);
    expect(intent.formatDirective).toBe("one_line");

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: spendLowPkg.syntheticProfile,
      responsePlan: {
        intentType: "general_impact_query",
        localFormatInstruction: "one_line",
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: false,
        isAlternativeOnly: false,
      },
    });

    const reply = generateSafeFallbackResponse(packet, "Jawab satu baris saja.");
    expect(reply.split("\n").filter((l) => l.trim().length > 0).length).toBe(1);
    expect(reply).not.toContain("Halo");
  });

  // 6. Format Ya atau Tidak dan Berapa
  it("Turn 6: Mengikuti instruksi 'ya atau tidak, dan berapa'", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("Jawab ya atau tidak, dan berapa nominalnya?", action);
    expect(intent.formatDirective).toBe("yes_no_amount");

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: spendLowPkg.syntheticProfile,
      responsePlan: {
        intentType: "general_impact_query",
        localFormatInstruction: "yes_no_amount",
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: false,
        isAlternativeOnly: false,
      },
    });

    const reply = generateSafeFallbackResponse(packet, "Jawab ya atau tidak, dan berapa?");
    expect(reply).toMatch(/^(Ya|Tidak)/);
    expect(reply).toContain("Rp 7.000.000");
  });

  // 7. Format Langsung Nominalnya
  it("Turn 7: Mengikuti instruksi 'langsung nominalnya'", () => {
    const action: FinancialAction = { ...saveLowPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("Langsung nominalnya saja.", action);
    expect(intent.formatDirective).toBe("nominal_only");

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: saveLowPkg.syntheticProfile,
      responsePlan: {
        intentType: "general_impact_query",
        localFormatInstruction: "nominal_only",
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: false,
        isAlternativeOnly: false,
      },
    });

    const reply = generateSafeFallbackResponse(packet, "Langsung nominalnya saja.");
    expect(reply).toContain("Rp 1.000.000");
  });

  // 8. Penanganan Kebingungan
  it("Turn 8: Mengurangi jargon dan menjelaskan pokok masalah saat pengguna bingung", () => {
    const action: FinancialAction = { ...spendHighPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("hah? saya bingung maksudnya apa", action);
    expect(intent.intentType).toBe("confusion");

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: spendHighPkg.syntheticProfile,
      responsePlan: {
        intentType: "confusion",
        simplifyExplanation: true,
        avoidQuestionnaireRepeat: false,
        isAlternativeOnly: false,
      },
    });

    const reply = generateSafeFallbackResponse(packet, "hah? saya bingung");
    expect(reply).toContain("Singkatnya begini");
    expect(reply).not.toContain("saldo kas operasional perbankan");
  });

  // 9. Penutupan Santun Saat Terima Kasih
  it("Turn 9: Menutup percakapan secara ringkas saat pengguna berterima kasih tanpa pertanyaan baru", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("Oke terima kasih banyak bantuannya!", action);
    expect(intent.intentType).toBe("thank_you");
    expect(intent.isThankYouWithNewQuestion).toBe(false);

    const packet = buildStructuredContextPacket({
      condition: "basic",
      action,
      responsePlan: {
        intentType: "thank_you",
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: false,
        isAlternativeOnly: false,
      },
    });

    const reply = generateSafeFallbackResponse(packet, "Oke terima kasih!");
    expect(reply).toBe("Sama-sama, semoga membantu.");
    expect(reply).not.toContain("?");
  });

  // 10. Konsistensi Penggunaan Kata 'Anda', 'saldo rekening', 'gajian berikutnya'
  it("Turn 10: Standar bahasa natural, tidak ada 'saldo kas rekening' atau 'siklus pendapatan'", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const calculation = calculateFinancialConsequences(action, spendLowPkg.syntheticProfile);
    expect(calculation.deterministicFacts.join(" ")).not.toContain("saldo kas rekening");
    expect(calculation.deterministicFacts.join(" ")).not.toContain("siklus pendapatan berikutnya");
    expect(calculation.deterministicFacts.join(" ")).toContain("saldo rekening");
  });

  // 11. Basic Assistant Mengingat Info yang Diberikan Pengguna
  it("Turn 11: Basic assistant menghitung secara presisi dari fakta yang diungkapkan tanpa membocorkan data sintetis", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const userMessage = "Saldo saya Rp 18.000.000 dan tagihan saya Rp 1.800.000";
    const intent = heuristicExtractIntent(userMessage, action);
    expect(intent.userProvidedFinances?.balance).toBe(18000000);
    expect(intent.userProvidedFinances?.liabilities).toBe(1800000);

    const calculation = calculateFinancialConsequences(action, null, intent.userProvidedFinances);
    expect(calculation.balanceAfterAction).toBe(11000000);
    expect(calculation.remainingCashAfterImmediateObligations).toBe(9200000);
  });

  // 12. Pembedaan Preferensi Berkelanjutan vs Format Lokal
  it("Turn 12: Membedakan preferensi berkelanjutan ('mulai sekarang singkat') dan format lokal ('satu baris')", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const intentOngoing = heuristicExtractIntent("Mulai sekarang jawab singkat saja.", action);
    expect(intentOngoing.formatDirective).toBe("brief_ongoing");

    const intentLocal = heuristicExtractIntent("Jawab satu baris saja.", action);
    expect(intentLocal.formatDirective).toBe("one_line");
  });

  // 13. Melanjutkan Konteks Jika Pengguna Kembali Bertanya Setelah Terima Kasih
  it("Turn 13: Melanjutkan konteks percakapan jika ada pertanyaan baru setelah ucapan terima kasih", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("Terima kasih, tapi kalau dicicil bunganya berapa?", action);
    expect(intent.isThankYouWithNewQuestion).toBe(true);
    expect(intent.intentType).toBe("alternative_exploration");
  });
});

