import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import fs from "fs";
import path from "path";
import { SCENARIO_PACKAGES } from "../src/fixtures/scenarios";
import { buildStructuredContextPacket } from "../src/lib/financial-engine/context-packager";
import { extractIntent, generateAssistantResponse, getGeminiModel } from "../src/lib/gemini";
import {
  FinancialAction,
  FinancialProfileContext,
  UserProvidedFinances,
} from "../src/lib/financial-engine/types";

interface MockTurn {
  turn: number;
  role: "assistant" | "respondent";
  content: string;
  timestamp: string;
  calculationSnapshot?: any;
}

interface MockCellResult {
  cellNumber: number;
  cellCode: string;
  scenarioId: string;
  scenarioTitle: string;
  actionType: "spending" | "saving";
  conflictLevel: "low" | "high";
  condition: "basic" | "context_aware";
  modelUsed: string;
  dialogueHistory: MockTurn[];
}

// 8 Cells with realistic respondent queries aligned with research instrument
const MOCK_CONFIGS: Array<{
  cellNumber: number;
  scenarioId: string;
  condition: "basic" | "context_aware";
  respondentQuestions: string[];
}> = [
  {
    cellNumber: 1,
    scenarioId: "spending_low",
    condition: "basic",
    respondentQuestions: [
      "Apakah saya aman membeli laptop seharga Rp7.000.000 ini secara tunai sekarang?",
      "Kira-kira apa saja hal yang perlu saya pertimbangkan sebelum memutuskan membeli laptop ini?",
    ],
  },
  {
    cellNumber: 2,
    scenarioId: "spending_low",
    condition: "context_aware",
    respondentQuestions: [
      "Apakah kondisi keuangan dan sisa anggaran saya aman kalau saya beli laptop Rp7.000.000 ini sekarang?",
      "Bagaimana dengan sisa uang kas saya untuk memenuhi kewajiban pembayaran terdekat sebelum gajian?",
    ],
  },
  {
    cellNumber: 3,
    scenarioId: "spending_high",
    condition: "basic",
    respondentQuestions: [
      "Saya berencana membeli laptop gaming Rp14.000.000 secara tunai, apakah ini keputusan yang bijak?",
      "Bagaimana jika uang tabungan saya terpakai banyak, apa risikonya untuk kebutuhan bulanan?",
    ],
  },
  {
    cellNumber: 4,
    scenarioId: "spending_high",
    condition: "context_aware",
    respondentQuestions: [
      "Apakah saya bisa membeli laptop gaming seharga Rp14.000.000 ini secara tunai sekarang?",
      "Berapa defisit anggaran saya dan apakah kewajiban pembayaran kos serta cicilan saya akan terganggu?",
    ],
  },
  {
    cellNumber: 5,
    scenarioId: "saving_low",
    condition: "basic",
    respondentQuestions: [
      "Saya berencana menyisihkan Rp2.000.000 ke dana darurat bulan ini, apakah nominal ini sudah tepat?",
      "Apakah ada saran bagaimana cara mengalokasikan sisa uang bulanan setelah menabung?",
    ],
  },
  {
    cellNumber: 6,
    scenarioId: "saving_low",
    condition: "context_aware",
    respondentQuestions: [
      "Apakah menyisihkan Rp2.000.000 ke dana darurat aman untuk likuiditas keuangan saya bulan ini?",
      "Apakah target tujuan keuangan dan kewajiban rutin saya sebelum tanggal gajian berikutnya tetap terpenuhi?",
    ],
  },
  {
    cellNumber: 7,
    scenarioId: "saving_high",
    condition: "basic",
    respondentQuestions: [
      "Saya ingin langsung menyisihkan Rp5.000.000 ke dana darurat sekaligus bulan ini, apakah itu keputusan bagus?",
      "Bagaimana cara memastikan apakah nominal Rp5.000.000 ini terlalu membebani kebutuhan kas harian saya?",
    ],
  },
  {
    cellNumber: 8,
    scenarioId: "saving_high",
    condition: "context_aware",
    respondentQuestions: [
      "Apakah aman jika saya menabung Rp5.000.000 ke dana darurat bulan ini?",
      "Apakah sisa uang kas likuid saya masih cukup untuk membayar sewa kos dan tagihan sebelum gaji berikutnya masuk?",
    ],
  },
];

async function runMockSimulation() {
  console.log("=== MEMULAI SIMULASI MOCK 8 SEL EKSPERIMEN ===");
  const model = getGeminiModel();
  console.log(`Model AI: ${model}`);

  const results: MockCellResult[] = [];

  for (const config of MOCK_CONFIGS) {
    console.log(`\n[Cell ${config.cellNumber}] Skenario: ${config.scenarioId} | Kondisi: ${config.condition}`);
    const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === config.scenarioId);
    if (!pkg) {
      throw new Error(`Package ${config.scenarioId} tidak ditemukan.`);
    }

    const dialogueHistory: MockTurn[] = [];

    // Turn 0: Initial Assistant Greeting
    let turnCount = 1;
    dialogueHistory.push({
      turn: turnCount++,
      role: "assistant",
      content: pkg.scenario.initialAssistantMessage,
      timestamp: new Date().toISOString(),
      calculationSnapshot:
        config.condition === "context_aware" ? pkg.expectedCalculations : null,
    });

    const currentAction: FinancialAction = {
      type: pkg.scenario.initialAction.type as "spending" | "saving",
      amount: pkg.scenario.initialAction.amount,
      timing: pkg.scenario.initialAction.timing,
      targetCategory: pkg.scenario.initialAction.targetCategory,
      description: pkg.scenario.initialAction.description,
      source: "scenario",
    };

    let syntheticProfileContext: FinancialProfileContext | null = null;
    if (config.condition === "context_aware") {
      syntheticProfileContext = {
        totalCashBalance: pkg.syntheticProfile.totalCashBalance,
        liquidBalance: pkg.syntheticProfile.liquidBalance,
        budgets: pkg.syntheticProfile.budgets as any,
        liabilities: pkg.syntheticProfile.liabilities as any,
        goals: pkg.syntheticProfile.goals as any,
        buffer: pkg.syntheticProfile.buffer as any,
        incomeSchedule: pkg.syntheticProfile.incomeSchedule as any,
        source: "synthetic_profile",
      };
    }

    let userProvidedFinances: UserProvidedFinances | null = null;

    // Chat History representation for Gemini prompt
    const chatHistorySummary: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "assistant", content: pkg.scenario.initialAssistantMessage },
    ];

    // Run Respondent Questions
    for (const userQuestion of config.respondentQuestions) {
      console.log(`  > Respondent: "${userQuestion}"`);
      dialogueHistory.push({
        turn: turnCount++,
        role: "respondent",
        content: userQuestion,
        timestamp: new Date().toISOString(),
      });
      chatHistorySummary.push({ role: "user", content: userQuestion });

      // 1. Extract Intent
      const intent = await extractIntent(userQuestion, currentAction);
      if (intent.newAmount && intent.newAmount > 0 && intent.newAmount !== currentAction.amount) {
        currentAction.amount = intent.newAmount;
        currentAction.modifiedByUser = true;
      }
      if (intent.userProvidedFinances) {
        userProvidedFinances = {
          ...intent.userProvidedFinances,
          source: "user_message",
        };
      }

      // 2. Build Structured Context Packet
      const contextPacket = buildStructuredContextPacket({
        condition: config.condition,
        action: currentAction,
        syntheticProfile: syntheticProfileContext,
        userProvidedFinances,
      });

      // 3. Generate Assistant Response
      const assistantResponse = await generateAssistantResponse(
        contextPacket,
        userQuestion,
        chatHistorySummary
      );

      console.log(`  < Assistant (${assistantResponse.isFallback ? "Fallback" : "Gemini"}): "${assistantResponse.content.slice(0, 80)}..."`);

      dialogueHistory.push({
        turn: turnCount++,
        role: "assistant",
        content: assistantResponse.content,
        timestamp: new Date().toISOString(),
        calculationSnapshot:
          config.condition === "context_aware" ? contextPacket.calculation : null,
      });
      chatHistorySummary.push({ role: "assistant", content: assistantResponse.content });
    }

    results.push({
      cellNumber: config.cellNumber,
      cellCode: `CELL_${config.cellNumber}_${config.scenarioId.toUpperCase()}_${config.condition.toUpperCase()}`,
      scenarioId: pkg.scenario.id,
      scenarioTitle: pkg.scenario.title,
      actionType: pkg.scenario.actionType as "spending" | "saving",
      conflictLevel: pkg.scenario.conflictLevel as "low" | "high",
      condition: config.condition,
      modelUsed: model,
      dialogueHistory,
    });
  }

  // Save to scratch directory
  const scratchDir = path.resolve(
    process.env.HOME || "",
    ".gemini/antigravity/brain/983da74a-8cd4-407a-a20f-2e91402564f8/scratch"
  );
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  const outputPath = path.join(scratchDir, "mock_conversations_8_cells.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n=== BERHASIL! Seluruh 8 percakapan tersimpan di: ===\n${outputPath}`);
}

runMockSimulation().catch((err) => {
  console.error("Gagal menjalankan simulasi mock:", err);
  process.exit(1);
});
