import { describe, it, expect } from "vitest";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import {
  heuristicExtractIntent,
  generateSafeFallbackResponse,
} from "@/lib/gemini";
import { buildStructuredContextPacket } from "@/lib/financial-engine/context-packager";
import { FinancialAction, ConversationState } from "@/lib/financial-engine/types";

describe("Penanganan Input Angka pada Chatbot Basic", () => {
  const spendLowPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_low")!;
  const saveLowPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "saving_low")!;

  it("menerima angka murni (misal: '10 juta') sebagai saldo saat asisten menanyakan saldo", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const convState: ConversationState = {
      activePlan: action,
      exploredAlternatives: [],
      userProvidedFacts: {},
      userConstraints: {},
      openClarifications: [],
      askedClarifications: ["balance"],
      confusionCount: 0,
      declinedDiscussion: false,
    };

    const intent = heuristicExtractIntent(
      "10 juta",
      action,
      convState,
      "Berapa perkiraan saldo rekening yang Anda miliki saat ini?"
    );

    expect(intent.userProvidedFinances?.balance).toBe(10000000);
    expect(intent.intentType).toBe("clarify_info");

    const packet = buildStructuredContextPacket({
      condition: "basic",
      action,
      userProvidedFinances: intent.userProvidedFinances,
      conversationState: {
        ...convState,
        userProvidedFacts: intent.userProvidedFinances || {},
      },
      responsePlan: {
        intentType: intent.intentType,
        isAlternativeOnly: false,
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: false,
        hasUserDisclosedAction: true,
      },
    });

    const reply = generateSafeFallbackResponse(packet, "10 juta", [
      { role: "assistant", content: "Berapa perkiraan saldo rekening yang Anda miliki saat ini?" },
      { role: "user", content: "10 juta" },
    ]);

    expect(reply).toContain("10.000.000");
    expect(reply).toContain("3.000.000");
    expect(reply).toContain("apakah ada tagihan terdekat atau kebutuhan rutin");
  });

  it("menerima variasi format angka ('10.000.000', '10jt', 'ada 10 juta')", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const convState: ConversationState = {
      activePlan: action,
      exploredAlternatives: [],
      userProvidedFacts: {},
      userConstraints: {},
      openClarifications: [],
      askedClarifications: ["balance"],
      confusionCount: 0,
      declinedDiscussion: false,
    };

    const res1 = heuristicExtractIntent("10.000.000", action, convState);
    expect(res1.userProvidedFinances?.balance).toBe(10000000);

    const res2 = heuristicExtractIntent("10jt", action, convState);
    expect(res2.userProvidedFinances?.balance).toBe(10000000);

    const res3 = heuristicExtractIntent("ada 10 juta", action, convState);
    expect(res3.userProvidedFinances?.balance).toBe(10000000);
  });

  it("menghitung kelayakan akhir saat pengguna memberikan kebutuhan rutin setelah saldo", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const convState: ConversationState = {
      activePlan: action,
      exploredAlternatives: [],
      userProvidedFacts: { balance: 10000000, routine: 2000000 },
      userConstraints: {},
      openClarifications: [],
      askedClarifications: ["balance", "routine"],
      confusionCount: 0,
      declinedDiscussion: false,
    };

    const packet = buildStructuredContextPacket({
      condition: "basic",
      action,
      userProvidedFinances: { balance: 10000000, routine: 2000000 },
      conversationState: convState,
      responsePlan: {
        intentType: "clarify_info",
        isAlternativeOnly: false,
        simplifyExplanation: false,
        avoidQuestionnaireRepeat: false,
        hasUserDisclosedAction: true,
      },
    });

    const reply = generateSafeFallbackResponse(packet, "kebutuhan rutin 2 juta", [
      { role: "assistant", content: "Dari saldo rekening Rp 10.000.000..." },
      { role: "user", content: "kebutuhan rutin 2 juta" },
    ]);

    expect(reply).toContain("10.000.000");
    expect(reply).toContain("3.000.000");
    expect(reply).toContain("2.000.000");
    expect(reply).toContain("1.000.000");
  });

  it("mengenali eksplorasi nominal baru seperti 'kalau 5 juta gimana'", () => {
    const action: FinancialAction = { ...spendLowPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("kalau 5 juta gimana", action);
    expect(intent.intentType).toBe("alternative_exploration");
    expect(intent.newAmount).toBe(5000000);
    expect(intent.isAlternativeOnly).toBe(true);
  });

  it("mengenali modifikasi nominal tabungan seperti 'tabung 500 ribu'", () => {
    const action: FinancialAction = { ...saveLowPkg.scenario.initialAction, source: "scenario" };
    const intent = heuristicExtractIntent("tabung 500 ribu", action);
    expect(intent.intentType).toBe("modify_action");
    expect(intent.newAmount).toBe(500000);
  });
});
