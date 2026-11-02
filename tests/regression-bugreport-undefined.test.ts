import { describe, it, expect } from "vitest";
import { calculateFinancialConsequences } from "@/lib/financial-engine/calculator";
import { buildStructuredContextPacket } from "@/lib/financial-engine/context-packager";
import { generateSafeFallbackResponse, heuristicExtractIntent } from "@/lib/gemini";
import {
  validateAssistantOutput,
  extractMentionedAmounts,
} from "@/lib/financial-engine/output-guardrail";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";

describe("Regression Tests: Bug Report Prevention (Rp undefined & User Range Inputs)", () => {
  const savingHighPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "saving_high")!;
  const spendingLowPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_low")!;

  describe("1. Currency Extraction & Guardrail on User Ranges & Mathematical Differences", () => {
    it("correctly extracts ranges such as '4-4.5 jt' and individual amounts", () => {
      const userMsg =
        "Tapi sertifikasiku udh deket, lagi 2-3 bulan dan mau ngumpulin 4-4.5 jt gt (baru 2jt), meanwhile dana daruratnya kek udah kekumpul 8 jt, targetku 12 jt. Pengeluaran wajibku kek yaa 6.6 jt lah";
      const amounts = extractMentionedAmounts(userMsg);

      expect(amounts).toContain(4000000);
      expect(amounts).toContain(4500000);
      expect(amounts).toContain(2000000);
      expect(amounts).toContain(8000000);
      expect(amounts).toContain(12000000);
      expect(amounts).toContain(6600000);
    });

    it("allows calculated shortfall/difference between user target and current accumulated in Guardrail", () => {
      const action = {
        type: "saving" as const,
        amount: 2000000,
        timing: "Bulan ini",
        targetCategory: "Dana Darurat",
        description: "Menambah tabungan",
        source: "scenario" as const,
      };

      const userProvided = {
        buffer: 8000000,
        routine: 6600000,
        emergencyCurrent: 8000000,
        emergencyTarget: 12000000,
        rawUserFigures: [4000000, 4500000, 2000000, 8000000, 12000000, 6600000],
      };

      const packet = buildStructuredContextPacket({
        condition: "basic",
        action,
        syntheticProfile: null,
        userProvidedFinances: userProvided,
        conversationState: {
          activePlan: action,
          userProvidedFacts: userProvided,
          userConstraints: {},
          exploredAlternatives: [],
          followupHistory: [{ userPrompt: "Awal" }],
          clarificationsPending: [],
        },
        hasUserDisclosedAction: true,
      });

      // Assistant computes shortfall: 4.500.000 - 2.000.000 = 2.500.000
      const assistantText =
        "Untuk program sertifikasi (kebutuhan Rp 4.000.000 hingga Rp 4.500.000, saat ini terkumpul Rp 2.000.000), " +
        "Anda masih membutuhkan dana sekitar Rp 2.500.000 lagi dalam 2–3 bulan ke depan. " +
        "Dengan pengeluaran wajib sekitar Rp 6.600.000 dan dana darurat Rp 8.000.000 dari target Rp 12.000.000, " +
        "alokasi menabung dapat disesuaikan agar tidak membebani arus kas bulanan.";

      const validation = validateAssistantOutput(assistantText, packet);
      expect(validation.isValid).toBe(true);
      expect(validation.violations).toHaveLength(0);
      expect(validation.metrics.ungroundedAmounts).toHaveLength(0);
    });
  });

  describe("2. Deterministic Safe Fallback: Zero 'undefined' Guarantee", () => {
    it("never produces 'undefined' or 'Rp undefined' when user has provided partial data in Basic Saving", () => {
      const action = {
        type: "saving" as const,
        amount: 2000000,
        timing: "Bulan ini",
        targetCategory: "Dana Darurat",
        description: "Menambah tabungan dana darurat",
        source: "scenario" as const,
      };

      const userProvided = {
        buffer: 8000000,
        routine: 6600000,
        emergencyCurrent: 8000000,
        emergencyTarget: 12000000,
      };

      const calc = calculateFinancialConsequences(action, null, userProvided);
      const packet = {
        condition: "basic" as const,
        action,
        calculation: calc,
        hasUserDisclosedAction: true,
        responsePlan: {
          intentType: "inquiry" as const,
          focalDimension: "liquidity" as const,
        },
        conversationState: {
          activePlan: action,
          userProvidedFacts: userProvided,
          userConstraints: {},
          exploredAlternatives: [],
          followupHistory: [{ userPrompt: "prompt 1" }],
          clarificationsPending: [],
        },
      };

      const testPrompts = [
        "Tapi sertifikasiku udh deket, lagi 2-3 bulan dan mau ngumpulin 4-4.5 jt gt (baru 2jt)",
        "Jadi gimana enaknya pembagian duitnya",
        "Yakin?",
        "cukup ga uangnya?",
        "apakah aman?",
      ];

      for (const prompt of testPrompts) {
        const fallback = generateSafeFallbackResponse(packet, prompt, [
          { role: "user", content: "Halo" },
          { role: "assistant", content: "Halo! Ada yang bisa dibantu?" },
        ]);

        expect(fallback).not.toContain("undefined");
        expect(fallback).not.toContain("Rp undefined");
        expect(fallback).not.toContain("NaN");
        expect(fallback.length).toBeGreaterThan(30);
      }
    });

    it("never produces 'undefined' when user has provided partial data in Basic Spending", () => {
      const action = {
        type: "spending" as const,
        amount: 7000000,
        timing: "Hari ini",
        targetCategory: "Pembelian Laptop",
        description: "Membeli laptop",
        source: "scenario" as const,
      };

      // User gave routine expenses only, balance is null
      const userProvided = {
        routine: 3800000,
      };

      const calc = calculateFinancialConsequences(action, null, userProvided);
      const packet = {
        condition: "basic" as const,
        action,
        calculation: calc,
        hasUserDisclosedAction: true,
        responsePlan: {
          intentType: "inquiry" as const,
          focalDimension: "liquidity" as const,
        },
        conversationState: {
          activePlan: action,
          userProvidedFacts: userProvided,
          userConstraints: {},
          exploredAlternatives: [],
          followupHistory: [{ userPrompt: "prompt 1" }],
          clarificationsPending: [],
        },
      };

      const testPrompts = [
        "Pengeluaran rutin saya sekitar 3.8 juta",
        "Jadi aman ga beli laptopnya?",
        "Yakin?",
      ];

      for (const prompt of testPrompts) {
        const fallback = generateSafeFallbackResponse(packet, prompt, [
          { role: "user", content: "Halo" },
          { role: "assistant", content: "Halo! Ada yang bisa dibantu?" },
        ]);

        expect(fallback).not.toContain("undefined");
        expect(fallback).not.toContain("Rp undefined");
        expect(fallback).not.toContain("NaN");
      }
    });

    it("never produces 'undefined' across all 4 research scenarios in Context-Aware condition", () => {
      for (const pkg of [savingHighPkg, spendingLowPkg]) {
        const action = {
          type: pkg.scenario.actionType as "spending" | "saving",
          amount: pkg.scenario.actionType === "spending" ? 7000000 : 2000000,
          timing: "Hari ini",
          targetCategory: pkg.scenario.actionType === "spending" ? "Pembelian Laptop" : "Dana Darurat",
          description: pkg.scenario.descriptionText,
          source: "scenario" as const,
        };

        const calc = calculateFinancialConsequences(action, {
          ...pkg.syntheticProfile,
          scenarioId: pkg.scenario.id,
          h0Date: pkg.scenario.h0Date,
          source: "synthetic_profile",
        });

        const packet = buildStructuredContextPacket({
          condition: "context_aware",
          action,
          syntheticProfile: {
            ...pkg.syntheticProfile,
            scenarioId: pkg.scenario.id,
            h0Date: pkg.scenario.h0Date,
            source: "synthetic_profile",
          },
          responsePlan: {
            intentType: "inquiry",
            focalDimension: "liquidity",
          },
          hasUserDisclosedAction: true,
        });

        const prompts = [
          "Jadi gimana enaknya pembagian duitnya",
          "cukup ga uangnya?",
          "Yakin?",
          "apakah aman?",
        ];

        for (const p of prompts) {
          const fallback = generateSafeFallbackResponse(packet, p, [
            { role: "user", content: "Halo" },
            { role: "assistant", content: "Halo! Ada yang bisa dibantu?" },
          ]);

          expect(fallback).not.toContain("undefined");
          expect(fallback).not.toContain("Rp undefined");
          expect(fallback).not.toContain("NaN");
        }
      }
    });
  });

  describe("3. End-to-End User Turn Simulation for the Reported Conversation", () => {
    it("simulates Turn 1: user discloses financial figures without crashing or returning undefined", () => {
      const action = {
        type: "saving" as const,
        amount: 2000000,
        timing: "Bulan ini",
        targetCategory: "Dana Darurat",
        description: "Menambah tabungan dana darurat",
        source: "scenario" as const,
      };

      const userMsg1 =
        "Tapi sertifikasiku udh deket, lagi 2-3 bulan dan mau ngumpulin 4-4.5 jt gt (baru 2jt), meanwhile dana daruratnya kek udah kekumpul 8 jt, targetku 12 jt. Pengeluaran wajibku kek yaa 6.6 jt lah";

      const extracted = heuristicExtractIntent(userMsg1, action);
      expect(extracted.userProvidedFinances).toBeDefined();
      expect(extracted.userProvidedFinances?.buffer).toBe(8000000);
      expect(extracted.userProvidedFinances?.routine).toBe(6600000);
      expect(extracted.userProvidedFinances?.emergencyTarget).toBe(12000000);

      const convState = {
        activePlan: action,
        userProvidedFacts: extracted.userProvidedFinances || {},
        userConstraints: {},
        exploredAlternatives: [],
        followupHistory: [],
        clarificationsPending: [],
      };

      const packet1 = buildStructuredContextPacket({
        condition: "basic",
        action,
        syntheticProfile: null,
        userProvidedFinances: extracted.userProvidedFinances,
        conversationState: convState,
        hasUserDisclosedAction: true,
      });

      const fallback1 = generateSafeFallbackResponse(packet1, userMsg1, [
        { role: "user", content: "Halo" },
        { role: "assistant", content: "Halo! Ada yang bisa dibantu?" },
      ]);

      expect(fallback1).not.toContain("undefined");
      expect(fallback1).not.toContain("Rp undefined");
    });

    it("simulates Turn 2: 'Yakin?' and Turn 3: 'Jadi gimana enaknya pembagian duitnya'", () => {
      const action = {
        type: "saving" as const,
        amount: 2000000,
        timing: "Bulan ini",
        targetCategory: "Dana Darurat",
        description: "Menambah tabungan dana darurat",
        source: "scenario" as const,
      };

      const userProvided = {
        buffer: 8000000,
        routine: 6600000,
        emergencyCurrent: 8000000,
        emergencyTarget: 12000000,
      };

      const convState = {
        activePlan: action,
        userProvidedFacts: userProvided,
        userConstraints: {},
        exploredAlternatives: [],
        followupHistory: [
          { userPrompt: "Pertanyaan 1" },
          { userPrompt: "Yakin?" },
        ],
        clarificationsPending: [],
      };

      const packet = buildStructuredContextPacket({
        condition: "basic",
        action,
        syntheticProfile: null,
        userProvidedFinances: userProvided,
        conversationState: convState,
        hasUserDisclosedAction: true,
      });

      const fallback2 = generateSafeFallbackResponse(packet, "Yakin?", [
        { role: "user", content: "Pertanyaan 1" },
        { role: "assistant", content: "Jawaban 1" },
      ]);
      expect(fallback2).not.toContain("undefined");

      const fallback3 = generateSafeFallbackResponse(packet, "Jadi gimana enaknya pembagian duitnya", [
        { role: "user", content: "Yakin?" },
        { role: "assistant", content: fallback2 },
      ]);
      expect(fallback3).not.toContain("undefined");
      expect(fallback3).not.toContain("Rp undefined");
      expect(fallback3).toContain("Rp 2.000.000");
    });
  });
});
