import { describe, it, expect } from "vitest";
import { sanitizeAmount, extractSpokenIndonesianAmount, hasUserDisclosedAction } from "@/lib/financial-engine/validator";
import { extractMentionedAmounts, validateAssistantOutput } from "@/lib/financial-engine/output-guardrail";
import { heuristicExtractIntent, generateSafeFallbackResponse, getGeminiModel } from "@/lib/gemini";
import { calculateFinancialConsequences } from "@/lib/financial-engine/calculator";
import { buildStructuredContextPacket } from "@/lib/financial-engine/context-packager";
import { FinancialAction, StructuredContextPacket } from "@/lib/financial-engine/types";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { POST_QUESTIONNAIRE_ITEMS, LIKERT_OPTIONS } from "@/lib/survey-questions";
import { DEFAULT_GENERATION_PARAMS } from "@/lib/prompts/templates";

describe("Post-Pilot P0 Revisions & Verification Suite", () => {
  const spendLowPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_low")!;
  const saveHighPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "saving_high")!;
  const saveLowPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "saving_low")!;

  // =========================================================================
  // 1. UNIT TEST NOMINAL & KALKULASI
  // =========================================================================
  describe("1. Unit Test: Numeric Parsing & Calculations", () => {
    it("parses all required currency format variations accurately", () => {
      // Table requirements from Section 2.A
      expect(sanitizeAmount("1.5jt")).toBe(1500000);
      expect(sanitizeAmount("1,5 juta")).toBe(1500000);
      expect(sanitizeAmount("2.3 juta")).toBe(2300000);
      expect(sanitizeAmount("1.500.000")).toBe(1500000);
      expect(sanitizeAmount("750rb")).toBe(750000);
      expect(sanitizeAmount("1,3jt")).toBe(1300000);
    });

    it("parses spoken Indonesian currency amounts", () => {
      expect(extractSpokenIndonesianAmount("satu koma lima juta")).toBe(1500000);
      expect(extractSpokenIndonesianAmount("satu juta tiga ratus")).toBe(1300000);
      expect(extractSpokenIndonesianAmount("dua koma tiga juta")).toBe(2300000);
      expect(extractSpokenIndonesianAmount("tujuh ratus lima puluh ribu")).toBe(750000);
    });

    it("never confuses durations or counts with Rupiah", () => {
      // "6 hari" or "12 hari" or "3 bulan" must not become Rp6 or Rp12 or Rp3
      const textWithDuration = "ada tagihan dalam 6 hari kedepan sebesar 1.800.000";
      const amounts = extractMentionedAmounts(textWithDuration);
      expect(amounts).toContain(1800000);
      expect(amounts).not.toContain(6);

      const textWithMonths = "alokasi selama 3-4 bulan ke depan sebesar 5 juta";
      const amounts2 = extractMentionedAmounts(textWithMonths);
      expect(amounts2).toContain(5000000);
      expect(amounts2).not.toContain(3);
      expect(amounts2).not.toContain(4);
    });

    it("identifies ambiguous unitless bare numbers and asks for clarification", () => {
      const currentAction: FinancialAction = {
        type: "spending",
        amount: 7000000,
        timing: "Hari ini",
        targetCategory: "Laptop",
        description: "Beli laptop",
        source: "scenario",
      };
      const ambiguousIntent = heuristicExtractIntent("3", currentAction);
      expect(ambiguousIntent.intentType).toBe("confusion");
      expect(ambiguousIntent.referencedEntity).toBe("ambiguous_nominal");
    });

    it("executes deterministic calculation: Saldo 18M - laptop 7M - tagihan 1.8M = 9.2M", () => {
      // Test for Basic (user-provided facts)
      const userFacts = {
        balance: 18000000,
        liabilities: 1800000,
        buffer: 5000000,
        source: "user_message" as const,
      };
      const basicAction: FinancialAction = {
        type: "spending",
        amount: 7000000,
        timing: "Hari ini",
        targetCategory: "Laptop",
        description: "Beli laptop",
        source: "scenario",
      };
      const basicCalc = calculateFinancialConsequences(basicAction, null, userFacts);
      expect(basicCalc.initialBalance).toBe(18000000);
      expect(basicCalc.balanceAfterAction).toBe(11000000);
      expect(basicCalc.remainingCashAfterImmediateObligations).toBe(9200000);
      expect(basicCalc.isBufferMaintained).toBe(true);

      // Test for Context-Aware (synthetic profile)
      const caCalc = calculateFinancialConsequences(basicAction, spendLowPkg.syntheticProfile);
      expect(caCalc.initialBalance).toBe(18000000);
      expect(caCalc.balanceAfterAction).toBe(11000000);
      expect(caCalc.remainingCashAfterImmediateObligations).toBe(9200000);
      expect(caCalc.isBufferMaintained).toBe(true);
    });
  });

  // =========================================================================
  // 2. REGRESSION TEST DARI 12 KASUS PILOT
  // =========================================================================
  describe("2. Regression Test: Pilot Error Cases Replay", () => {
    it("Case RESP-1161B2 & RESP-729C1D: '2.3-3 juta' and '6 hari sebesar 1.800.000' extraction", () => {
      const action = { ...spendLowPkg.scenario.initialAction, source: "scenario" as const };
      const intent = heuristicExtractIntent("tagihan 6 hari kedepan sebesar 1.800.000", action);
      expect(intent.userProvidedFinances?.liabilities).toBe(1800000);

      const intentRange = heuristicExtractIntent("pengeluaran bulanan sekitar 2.3-3 juta", action);
      expect(intentRange.userProvidedFinances?.routine).toBe(2300000);
    });

    it("Case RESP-0B140F: Accessory purchase inquiry does not corrupt balance or action amount", () => {
      const action = { ...spendLowPkg.scenario.initialAction, source: "scenario" as const };
      const convState = {
        activePlan: action,
        exploredAlternatives: [],
        userProvidedFacts: { balance: 18000000 },
        userConstraints: {},
        openClarifications: [],
        confusionCount: 0,
        declinedDiscussion: false,
      };

      const intent = heuristicExtractIntent(
        "kalau mau beli aksesoris laptopnya dengan sekitaran uang 1.000.000 sisa berapa?",
        action,
        convState
      );
      // Must not overwrite active plan amount or balance
      expect(intent.newAmount).toBeNull();

      const packet = buildStructuredContextPacket({
        condition: "context_aware",
        action,
        syntheticProfile: spendLowPkg.syntheticProfile,
        conversationState: convState,
      });

      const fallback = generateSafeFallbackResponse(
        packet,
        "kalau mau beli aksesoris laptopnya dengan sekitaran uang 1.000.000 sisa berapa?",
        [
          { role: "user", content: "Halo, saya mau beli laptop Rp 7.000.000" },
          { role: "assistant", content: "Kondisi keuangan Anda masih aman..." },
        ]
      );

      // Calculates 18M - 7M - 1M - 1.8M = 8.2M
      expect(fallback).toContain("Rp 8.200.000");
      expect(fallback).toContain("Rp 10.000.000");
    });

    it("Case RESP-88DC9C & RESP-22D683: '1.5 msh aman ga' and 'kalau 1,3jt?' updates plan nominal", () => {
      const action = { ...saveLowPkg.scenario.initialAction, amount: 2000000, source: "scenario" as const };
      const intent1 = heuristicExtractIntent("1.5 msh aman ga", action);
      expect(intent1.newAmount).toBe(1500000);

      const intent2 = heuristicExtractIntent("kalau 1,3jt?", action);
      expect(intent2.newAmount).toBe(1300000);

      const intent3 = heuristicExtractIntent("kalau satu juta tiga ratus?", action);
      expect(intent3.newAmount).toBe(1300000);
    });

    it("Case RESP-676B99: 'kebutuhan sehari-hari yang akan digunakan sebesar 6.300.000' matches routine", () => {
      const action = { ...saveLowPkg.scenario.initialAction, source: "scenario" as const };
      const intent = heuristicExtractIntent(
        "kebutuhan saya sehari hari yang perkiraan akan digunakan sebesar 6.300.000",
        action
      );
      expect(intent.userProvidedFinances?.routine).toBe(6300000);
    });

    it("Case RESP-142FE4: Multi-month target division (Rp5 juta / 4 bulan = Rp1.250.000) allowed by guardrail", () => {
      const action = { ...saveLowPkg.scenario.initialAction, source: "scenario" as const };
      const packet = buildStructuredContextPacket({
        condition: "basic",
        action,
        syntheticProfile: null,
        userProvidedFinances: {
          rawUserFigures: [5000000],
          income: 8000000,
          routine: 6000000,
          source: "user_message",
        },
      });

      const responseWithDerivedAmount =
        "Untuk target Rp 5.000.000 yang dibagi ke dalam 4 bulan, alokasi yang perlu disisihkan adalah Rp 1.250.000 per bulan.";
      const guardrail = validateAssistantOutput(responseWithDerivedAmount, packet);

      expect(guardrail.isValid).toBe(true);
      expect(guardrail.metrics.ungroundedAmounts).not.toContain(1250000);
    });
  });

  // =========================================================================
  // 3. FALLBACK TEST (NO GREETING LOOPS, NO REPEATING QUESTIONS)
  // =========================================================================
  describe("3. Fallback Test: State Retention & No Looping Greetings", () => {
    it("never resets to greeting when user is on follow-up turns or asks specific questions", () => {
      const action = { ...spendLowPkg.scenario.initialAction, source: "scenario" as const };
      const packet = buildStructuredContextPacket({
        condition: "basic",
        action,
        syntheticProfile: null,
        userProvidedFinances: {
          balance: 18000000,
          liabilities: 1800000,
          source: "user_message",
        },
        hasUserDisclosedAction: true,
      });

      const history = [
        { role: "user" as const, content: "Halo, saya mau beli laptop 7 juta" },
        { role: "assistant" as const, content: "Berapa perkiraan saldo Anda?" },
        { role: "user" as const, content: "Saldo saya 18 juta dan tagihan 1.8 juta" },
      ];

      const fallback = generateSafeFallbackResponse(
        packet,
        "apakah sisa saldo masih cukup?",
        history
      );

      // Must NOT reset to initial greeting
      expect(fallback).not.toContain("Halo! Saya asisten finansial Anda");
      // Must answer using calculation
      expect(fallback).toContain("Rp 11.000.000");
      expect(fallback).toContain("Rp 9.200.000");
    });

    it("evaluates active action amount in Context-Aware saving fallback when modified", () => {
      const modifiedAction: FinancialAction = {
        ...saveLowPkg.scenario.initialAction,
        amount: 1500000, // Modified by user from 2M to 1.5M
        source: "user_message",
      };

      const packet = buildStructuredContextPacket({
        condition: "context_aware",
        action: modifiedAction,
        syntheticProfile: saveLowPkg.syntheticProfile,
        hasUserDisclosedAction: true,
      });

      const fallback = generateSafeFallbackResponse(
        packet,
        "1.5 msh aman ga",
        [
          { role: "user", content: "Halo mau nabung 2 juta" },
          { role: "assistant", content: "Menyetor Rp 2.000.000 berisiko defisit..." },
        ]
      );

      // Must evaluate Rp 1.500.000, not hardcoded 2M
      expect(fallback).toContain("Rp 1.500.000");
      expect(fallback).not.toContain("Menyetor Rp 2.000.000");
    });
  });

  // =========================================================================
  // 4. TREATMENT PARITY TEST (BASIC VS CONTEXT-AWARE BOUNDARIES)
  // =========================================================================
  describe("4. Treatment Parity Test: Access Boundaries & Calculator Parity", () => {
    it("Basic strictly never receives synthetic profile context", () => {
      const action = { ...spendLowPkg.scenario.initialAction, source: "scenario" as const };
      const basicPacket = buildStructuredContextPacket({
        condition: "basic",
        action,
        syntheticProfile: null,
      });

      expect(basicPacket.availableProfile).toBeNull();
      expect(basicPacket.dataSources).toEqual(["scenario"]);
      expect(basicPacket.calculation.initialBalance).toBeNull();
    });

    it("Context-Aware includes verified synthetic profile", () => {
      const action = { ...spendLowPkg.scenario.initialAction, source: "scenario" as const };
      const caPacket = buildStructuredContextPacket({
        condition: "context_aware",
        action,
        syntheticProfile: spendLowPkg.syntheticProfile,
      });

      expect(caPacket.availableProfile).not.toBeNull();
      expect(caPacket.availableProfile?.totalCashBalance).toBe(18000000);
      expect(caPacket.calculation.initialBalance).toBe(18000000);
    });

    it("Both conditions use the same calculateFinancialConsequences function", () => {
      const action = { ...spendLowPkg.scenario.initialAction, source: "scenario" as const };
      const userFacts = {
        balance: 18000000,
        liabilities: 1800000,
        buffer: 5000000,
        source: "user_message" as const,
      };

      const basicCalc = calculateFinancialConsequences(action, null, userFacts);
      const caCalc = calculateFinancialConsequences(action, spendLowPkg.syntheticProfile);

      expect(basicCalc.balanceAfterAction).toBe(caCalc.balanceAfterAction);
      expect(basicCalc.remainingCashAfterImmediateObligations).toBe(caCalc.remainingCashAfterImmediateObligations);
      expect(basicCalc.isBufferMaintained).toBe(caCalc.isBufferMaintained);
    });
  });

  // =========================================================================
  // 5. INSTRUMENT CHECK (SURVEY, MAC ORDER, LIKERT SCALE, RUNTIME CONFIG)
  // =========================================================================
  describe("5. Instrument & Runtime Configuration Check", () => {
    it("verifies revised RMAS1 and OCC1 item wording", () => {
      const rmas1 = POST_QUESTIONNAIRE_ITEMS.find((q) => q.code === "RMAS1");
      expect(rmas1).toBeDefined();
      expect(rmas1?.statement).toContain("teringat bahwa sebagian uang saya sudah diperuntukkan bagi kebutuhan tertentu");

      const occ1 = POST_QUESTIONNAIRE_ITEMS.find((q) => q.code === "OCC1");
      expect(occ1).toBeDefined();
      expect(occ1?.statement).toContain("mempertimbangkan bagaimana penggunaan dana untuk keputusan ini dapat memengaruhi kemampuan saya");
    });

    it("verifies MAC order is MAC3, MAC4, MAC1, MAC2", () => {
      const macQuestions = POST_QUESTIONNAIRE_ITEMS.filter((q) => q.code.startsWith("MAC"));
      const codes = macQuestions.map((q) => q.code);
      expect(codes).toEqual(["MAC3", "MAC4", "MAC1", "MAC2"]);
    });

    it("verifies all variable codes remain unchanged", () => {
      const expectedCodes = [
        "AT1", "AT2", "AT3", "AT4",
        "MAC3", "MAC4", "MAC1", "MAC2",
        "RMAS1", "RMAS2", "RMAS3", "RMAS4",
        "OCC1", "OCC2", "OCC3", "OCC4",
        "PFDA1", "PFDA2", "PFDA3", "PFDA4",
      ];
      const actualCodes = POST_QUESTIONNAIRE_ITEMS.map((q) => q.code);
      expect(actualCodes).toEqual(expectedCodes);
    });

    it("verifies 1-7 Likert scale options", () => {
      expect(LIKERT_OPTIONS).toHaveLength(7);
      expect(LIKERT_OPTIONS[0].value).toBe(1);
      expect(LIKERT_OPTIONS[6].value).toBe(7);
    });

    it("verifies frozen runtime invariants: model and generation params", () => {
      expect(getGeminiModel()).toBe("gemini-2.5-flash");
      expect(DEFAULT_GENERATION_PARAMS.temperature).toBe(0.1);
      expect(DEFAULT_GENERATION_PARAMS.topP).toBe(0.9);
      expect(DEFAULT_GENERATION_PARAMS.maxOutputTokens).toBe(600);
    });
  });

  // =========================================================================
  // 6. EXPERIMENTAL ISOLATION & ACCURACY (BASIC VS CONTEXT-AWARE)
  // =========================================================================
  describe("6. Experimental Isolation & Real Case Verification", () => {
    it("Basic chatbot with undisclosed action calculates pure user figures without deducting laptop", () => {
      const userMessage = "saldo 18jt, dana darurat 5jt, tagihan 1,8jt. sisa berapa";
      const action = { ...spendLowPkg.scenario.initialAction, source: "scenario" as const };
      const chatHistory = [{ role: "user" as const, content: userMessage }];

      const disclosed = hasUserDisclosedAction(chatHistory, action);
      expect(disclosed).toBe(false);

      const intent = heuristicExtractIntent(userMessage, action);
      expect(intent.userProvidedFinances?.balance).toBe(18000000);
      expect(intent.userProvidedFinances?.liabilities).toBe(1800000);
      expect(intent.userProvidedFinances?.buffer).toBe(5000000);

      const packet = buildStructuredContextPacket({
        condition: "basic",
        action,
        userProvidedFinances: intent.userProvidedFinances,
        hasUserDisclosedAction: disclosed,
      });

      // Verification: Action of 7M MUST NOT be deducted!
      expect(packet.calculation.initialBalance).toBe(18000000);
      expect(packet.calculation.balanceAfterAction).toBe(18000000);
      expect(packet.calculation.remainingCashAfterImmediateObligations).toBe(16200000); // 18M - 1.8M = 16.2M
      const surplusAfterEmergency = (packet.calculation.remainingCashAfterImmediateObligations || 0) - (packet.calculation.bufferImpact.minBuffer || 0);
      expect(surplusAfterEmergency).toBe(11200000); // 16.2M - 5M = 11.2M

      // Fallback response check: No mention of laptop or 7 million!
      const fallback = generateSafeFallbackResponse(packet, userMessage, chatHistory);
      expect(fallback).toContain("16.200.000");
      expect(fallback).toContain("11.200.000");
      expect(fallback.toLowerCase()).not.toContain("laptop");
      expect(fallback).not.toContain("7.000.000");
    });

    it("Follow-up with 'sorry, cicilan 1,8jt' treats 1.8M as liability and does NOT parse as Rp18", () => {
      const action = { ...spendLowPkg.scenario.initialAction, source: "scenario" as const };
      const intent = heuristicExtractIntent("sorry, cicilan 1,8jt", action);

      expect(intent.userProvidedFinances?.liabilities).toBe(1800000);
      expect(intent.userProvidedFinances?.liabilities).not.toBe(18);
      expect(intent.focalDimension).toBe("bills");
      expect(intent.intentType).toBe("clarify_info");
      expect(intent.preferredPaymentMethod).toBeNull();

      const chatHistory = [
        { role: "user" as const, content: "saldo 18jt, dana darurat 5jt, tagihan 1,8jt. sisa berapa" },
        { role: "assistant" as const, content: "Sisa saldo Anda Rp 16.200.000 dan sisa dana bebas Rp 11.200.000." },
        { role: "user" as const, content: "sorry, cicilan 1,8jt" },
      ];
      expect(hasUserDisclosedAction(chatHistory, action)).toBe(false);
    });

    it("Discloses action ONLY when user explicitly asks to purchase laptop", () => {
      const action = { ...spendLowPkg.scenario.initialAction, source: "scenario" as const };
      const chatHistory = [
        { role: "user" as const, content: "saldo 18jt, dana darurat 5jt, tagihan 1,8jt. sisa berapa" },
        { role: "assistant" as const, content: "Sisa saldo Anda Rp 16.200.000 dan sisa dana bebas Rp 11.200.000." },
        { role: "user" as const, content: "kalau mau beli laptop 7jt gimana?" },
      ];

      const disclosed = hasUserDisclosedAction(chatHistory, action);
      expect(disclosed).toBe(true);

      const packet = buildStructuredContextPacket({
        condition: "basic",
        action,
        userProvidedFinances: {
          balance: 18000000,
          liabilities: 1800000,
          buffer: 5000000,
          source: "user_message",
        },
        hasUserDisclosedAction: disclosed,
      });

      // Now laptop 7M IS deducted
      expect(packet.calculation.initialBalance).toBe(18000000);
      expect(packet.calculation.balanceAfterAction).toBe(11000000); // 18M - 7M = 11M
      expect(packet.calculation.remainingCashAfterImmediateObligations).toBe(9200000); // 11M - 1.8M = 9.2M
      const surplus = (packet.calculation.remainingCashAfterImmediateObligations || 0) - (packet.calculation.bufferImpact.minBuffer || 0);
      expect(surplus).toBe(4200000); // 9.2M - 5M = 4.2M
    });
  });
});
