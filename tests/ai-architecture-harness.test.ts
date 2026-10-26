import { describe, it, expect } from "vitest";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { buildStructuredContextPacket } from "@/lib/financial-engine/context-packager";
import { calculateFinancialConsequences } from "@/lib/financial-engine/calculator";
import {
  generateSafeFallbackResponse,
  heuristicExtractIntent,
} from "@/lib/gemini";
import {
  buildSystemInstruction,
  buildUserPrompt,
} from "@/lib/prompts/templates";
import { FinancialAction, FinancialProfileContext } from "@/lib/financial-engine/types";

describe("AI Architecture Harness & Evaluation (Uji Berpasangan & Workflow)", () => {
  const highPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_high")!;
  const action: FinancialAction = {
    type: "spending",
    amount: 7000000,
    timing: "Hari ini",
    targetCategory: "Pembelian Laptop",
    description: "Membeli laptop baru untuk menunjang pekerjaan",
    source: "scenario",
  };

  const syntheticProfile: FinancialProfileContext = {
    ...highPkg.syntheticProfile,
    source: "synthetic_profile",
  };

  describe("1. Paired Testing (Uji Berpasangan): Basic vs Context-Aware", () => {
    it("Basic condition strictly restricts profile access while Context-Aware includes it", () => {
      // Basic Condition Packet
      const basicPacket = buildStructuredContextPacket({
        condition: "basic",
        action,
        syntheticProfile: null, // Gated by server
      });

      // Context-Aware Condition Packet
      const caPacket = buildStructuredContextPacket({
        condition: "context_aware",
        action,
        syntheticProfile,
      });

      // Basic assertions
      expect(basicPacket.condition).toBe("basic");
      expect(basicPacket.availableProfile).toBeNull();
      expect(basicPacket.calculation.status).toBe("needs_clarification");
      expect(basicPacket.calculation.initialBalance).toBeNull();
      expect(basicPacket.calculation.balanceAfterAction).toBeNull();
      expect(basicPacket.dataSources).toEqual(["scenario"]);

      // Context-Aware assertions
      expect(caPacket.condition).toBe("context_aware");
      expect(caPacket.availableProfile).not.toBeNull();
      expect(caPacket.calculation.status).toBe("valid");
      expect(caPacket.calculation.initialBalance).toBe(18000000);
      expect(caPacket.calculation.balanceAfterAction).toBe(11000000);
      expect(caPacket.calculation.budgetVariance).toBe(-4000000);
      expect(caPacket.calculation.remainingCashAfterImmediateObligations).toBe(9200000);
      expect(caPacket.dataSources).toContain("synthetic_profile");
    });

    it("Generates distinct system prompts for Basic vs Context-Aware conditions", () => {
      const basicSystem = buildSystemInstruction("basic");
      const caSystem = buildSystemInstruction("context_aware");

      expect(basicSystem).toContain("BASIC ASSISTANT");
      expect(basicSystem).toContain("TIDAK memiliki profil keuangan awal");
      expect(basicSystem).not.toContain("Sistem Berbasis Profil");

      expect(caSystem).toContain("CONTEXT-AWARE");
      expect(caSystem).toContain("Sistem Berbasis Profil");
      expect(caSystem).toContain("buffer dana darurat");
    });
  });

  describe("2. Basic Assistant Transition with Manual User Data", () => {
    it("transitions Basic from needs_clarification to valid calculation when user provides finances", () => {
      // Initial state: needs clarification
      const initialBasicPacket = buildStructuredContextPacket({
        condition: "basic",
        action,
        syntheticProfile: null,
      });
      expect(initialBasicPacket.calculation.status).toBe("needs_clarification");

      // User says: "Saldo saya 10 juta dan anggaran saya 3 juta"
      const userProvided = {
        balance: 10000000,
        budget: 3000000,
        source: "user_message" as const,
      };

      const updatedBasicPacket = buildStructuredContextPacket({
        condition: "basic",
        action,
        syntheticProfile: null,
        userProvidedFinances: userProvided,
      });

      expect(updatedBasicPacket.calculation.status).toBe("valid");
      expect(updatedBasicPacket.calculation.initialBalance).toBe(10000000);
      expect(updatedBasicPacket.calculation.balanceAfterAction).toBe(3000000);
      expect(updatedBasicPacket.calculation.isBudgetExceeded).toBe(true);
      expect(updatedBasicPacket.calculation.budgetVariance).toBe(-4000000);
      expect(updatedBasicPacket.dataSources).toContain("user_message");
      // Must not leak synthetic profile properties
      expect(updatedBasicPacket.availableProfile?.goals).toBeUndefined();
    });
  });

  describe("3. Dynamic Recalculation (Perubahan Nominal Tindakan)", () => {
    it("immediately recalculates when user modifies action nominal (e.g., 7M to 20M)", () => {
      const initialAction: FinancialAction = {
        type: "spending",
        amount: 7000000,
        timing: "Hari ini",
        targetCategory: "Pembelian Laptop",
        description: "Laptop A",
        source: "scenario",
      };

      const initialResult = calculateFinancialConsequences(initialAction, syntheticProfile);
      expect(initialResult.balanceAfterAction).toBe(11000000);
      expect(initialResult.deficitAmount).toBe(0);

      // User changes to 20 million (exceeding initial balance of 18M)
      const updatedAction: FinancialAction = {
        ...initialAction,
        amount: 20000000,
        source: "user_message",
      };

      const updatedResult = calculateFinancialConsequences(updatedAction, syntheticProfile);
      expect(updatedResult.balanceAfterAction).toBe(-2000000);
      expect(updatedResult.isLiquidityThreatened).toBe(true);
      // Deficit is: balanceAfterAction (-2M) - liabilities (1.8M) = -3.8M
      expect(updatedResult.deficitAmount).toBe(3800000);
      expect(updatedResult.budgetVariance).toBe(-17000000);
    });
  });

  describe("4. Structured Extraction Heuristics & Schema", () => {
    it("extracts newAmount and decision accurately from user natural language", () => {
      const currentAction = action;

      const res1 = heuristicExtractIntent("Ganti harganya jadi 14 juta aja", currentAction);
      expect(res1.intentType).toBe("modify_action");
      expect(res1.newAmount).toBe(14000000);

      const res2 = heuristicExtractIntent("Saya setuju, lanjut transaksi sekarang", currentAction);
      expect(res2.intentType).toBe("final_decision");
      expect(res2.decision).toBe("proceed");

      const res3 = heuristicExtractIntent("Tunda dulu pembeliannya sampai bulan depan", currentAction);
      expect(res3.intentType).toBe("final_decision");
      expect(res3.decision).toBe("postpone");

      const res4 = heuristicExtractIntent("Saldo saya saat ini ada 15 jt", currentAction);
      expect(res4.intentType).toBe("clarify_info");
      expect(res4.userProvidedFinances?.balance).toBe(15000000);
    });
  });

  describe("5. Deterministic Safe Fallback Response", () => {
    it("generates appropriate safe fallback for Basic condition without hallucinating numbers", () => {
      const basicPacket = buildStructuredContextPacket({
        condition: "basic",
        action,
        syntheticProfile: null,
      });

      const fallback = generateSafeFallbackResponse(basicPacket);
      expect(fallback).toContain("Rp 7.000.000");
      expect(fallback).toContain("belum tercatat dalam sesi ini");
      expect(fallback).not.toContain("saldo Anda tersisa");
    });

    it("generates factually grounded fallback for Context-Aware condition", () => {
      const caPacket = buildStructuredContextPacket({
        condition: "context_aware",
        action,
        syntheticProfile,
      });

      const fallback = generateSafeFallbackResponse(caPacket);
      expect(fallback).toContain("Rp 7.000.000");
      expect(fallback).toContain("Rp 11.000.000"); // balance after action
      expect(fallback).toContain("Rp 4.000.000"); // budget variance
      expect(fallback).toContain("Rp 1.800.000"); // liabilities
      expect(fallback).toContain("Rp 9.200.000"); // remaining cash
    });
  });

  describe("6. Prompt Layering & Experiment Boundary Isolation", () => {
    it("ensures prompt templates do not contain research variables or internal labels", () => {
      const caPacket = buildStructuredContextPacket({
        condition: "context_aware",
        action,
        syntheticProfile,
      });

      const prompt = buildUserPrompt(caPacket, "Apakah aman?", "");
      expect(prompt).not.toContain("MAC");
      expect(prompt).not.toContain("hipotesis");
      expect(prompt).not.toContain("kuesioner");
      expect(prompt).toContain("<fakta_perhitungan_terverifikasi>");
      expect(prompt).toContain("<kontrak_respons>");
    });
  });
});
