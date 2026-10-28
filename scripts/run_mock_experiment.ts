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
  responseSource?: "gemini" | "safe_fallback";
  calculationSnapshot?: Record<string, unknown> | null;
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

// 8 Cells with RIGOROUS IDENTICAL CONTROLLED QUESTIONS per scenario pair
const MOCK_CONFIGS_8_CELLS: Array<{
  cellNumber: number;
  scenarioId: string;
  condition: "basic" | "context_aware";
  respondentQuestions: string[];
}> = [
  // Pair 1: Spending Low (Cell 1 & Cell 2 receive IDENTICAL questions)
  {
    cellNumber: 1,
    scenarioId: "spending_low",
    condition: "basic",
    respondentQuestions: [
      "Apakah saya aman membeli laptop seharga Rp7.000.000 ini secara tunai sekarang?",
      "Bagaimana dampaknya terhadap sisa saldo kas dan kewajiban pembayaran terdekat saya?",
    ],
  },
  {
    cellNumber: 2,
    scenarioId: "spending_low",
    condition: "context_aware",
    respondentQuestions: [
      "Apakah saya aman membeli laptop seharga Rp7.000.000 ini secara tunai sekarang?",
      "Bagaimana dampaknya terhadap sisa saldo kas dan kewajiban pembayaran terdekat saya?",
    ],
  },

  // Pair 2: Spending High (Cell 3 & Cell 4 receive IDENTICAL questions)
  {
    cellNumber: 3,
    scenarioId: "spending_high",
    condition: "basic",
    respondentQuestions: [
      "Apakah saya aman membeli laptop seharga Rp7.000.000 ini secara tunai sekarang?",
      "Bagaimana dampaknya terhadap sisa saldo kas dan kewajiban pembayaran terdekat saya?",
    ],
  },
  {
    cellNumber: 4,
    scenarioId: "spending_high",
    condition: "context_aware",
    respondentQuestions: [
      "Apakah saya aman membeli laptop seharga Rp7.000.000 ini secara tunai sekarang?",
      "Bagaimana dampaknya terhadap sisa saldo kas dan kewajiban pembayaran terdekat saya?",
    ],
  },

  // Pair 3: Saving Low (Cell 5 & Cell 6 receive IDENTICAL questions)
  {
    cellNumber: 5,
    scenarioId: "saving_low",
    condition: "basic",
    respondentQuestions: [
      "Apakah menyisihkan Rp2.000.000 ke dana darurat aman untuk kondisi keuangan saya bulan ini?",
      "Bagaimana dampaknya terhadap sisa dana dan kewajiban pembayaran terdekat saya?",
    ],
  },
  {
    cellNumber: 6,
    scenarioId: "saving_low",
    condition: "context_aware",
    respondentQuestions: [
      "Apakah menyisihkan Rp2.000.000 ke dana darurat aman untuk kondisi keuangan saya bulan ini?",
      "Bagaimana dampaknya terhadap sisa dana dan kewajiban pembayaran terdekat saya?",
    ],
  },

  // Pair 4: Saving High (Cell 7 & Cell 8 receive IDENTICAL questions)
  {
    cellNumber: 7,
    scenarioId: "saving_high",
    condition: "basic",
    respondentQuestions: [
      "Apakah menyisihkan Rp2.000.000 ke dana darurat aman untuk kondisi keuangan saya bulan ini?",
      "Bagaimana dampaknya terhadap sisa dana dan kewajiban pembayaran terdekat saya?",
    ],
  },
  {
    cellNumber: 8,
    scenarioId: "saving_high",
    condition: "context_aware",
    respondentQuestions: [
      "Apakah menyisihkan Rp2.000.000 ke dana darurat aman untuk kondisi keuangan saya bulan ini?",
      "Bagaimana dampaknya terhadap sisa dana dan kewajiban pembayaran terdekat saya?",
    ],
  },
];

async function runDialogue(
  scenarioId: string,
  condition: "basic" | "context_aware",
  questions: string[]
): Promise<{ dialogueHistory: MockTurn[]; finalAction: FinancialAction }> {
  const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === scenarioId);
  if (!pkg) {
    throw new Error(`Package ${scenarioId} tidak ditemukan.`);
  }

  const dialogueHistory: MockTurn[] = [];
  let turnCount = 1;

  const currentAction: FinancialAction = {
    type: pkg.scenario.initialAction.type as "spending" | "saving",
    amount: pkg.scenario.initialAction.amount,
    timing: pkg.scenario.initialAction.timing,
    targetCategory: pkg.scenario.initialAction.targetCategory,
    description: pkg.scenario.initialAction.description,
    source: "scenario",
  };

  let syntheticProfileContext: FinancialProfileContext | null = null;
  if (condition === "context_aware") {
    syntheticProfileContext = pkg.syntheticProfile;
  }

  let userProvidedFinances: UserProvidedFinances | null = null;
  const chatHistorySummary: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const userQuestion of questions) {
    // Respect rate limits with polite delay
    await new Promise((resolve) => setTimeout(resolve, 6500));

    console.log(`  > Responden: "${userQuestion}"`);
    dialogueHistory.push({
      turn: turnCount++,
      role: "respondent",
      content: userQuestion,
      timestamp: new Date().toISOString(),
    });
    chatHistorySummary.push({ role: "user", content: userQuestion });

    // 1. Intent Extraction
    const intent = await extractIntent(userQuestion, currentAction);
    if (intent.newAmount && intent.newAmount > 0 && intent.newAmount !== currentAction.amount) {
      currentAction.amount = intent.newAmount;
      currentAction.modifiedByUser = true;
    }
    if (intent.userProvidedFinances) {
      userProvidedFinances = {
        ...(userProvidedFinances || {}),
        ...intent.userProvidedFinances,
        source: "user_message",
      };
    }

    // 2. Build Structured Context Packet
    const contextPacket = buildStructuredContextPacket({
      condition,
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

    console.log(
      `  < Asisten (${assistantResponse.responseSource.toUpperCase()}): "${assistantResponse.content.slice(
        0,
        90
      )}..."`
    );

    dialogueHistory.push({
      turn: turnCount++,
      role: "assistant",
      content: assistantResponse.content,
      timestamp: new Date().toISOString(),
      responseSource: assistantResponse.responseSource,
      calculationSnapshot: contextPacket.calculation as unknown as Record<string, unknown>,
    });
    chatHistorySummary.push({ role: "assistant", content: assistantResponse.content });
  }

  return { dialogueHistory, finalAction: currentAction };
}

async function runMockSimulation() {
  console.log("=================================================================");
  console.log("       EKSEKUSI SIMULASI MOCK 8 SEL & PENGUJIAN KHUSUS          ");
  console.log("=================================================================");
  const model = getGeminiModel();
  console.log(`Model AI: ${model}`);

  const conversationId = "983da74a-8cd4-407a-a20f-2e91402564f8";
  const scratchDir = path.resolve(
    process.env.HOME || "",
    `.gemini/antigravity/brain/${conversationId}/scratch`
  );
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  // =========================================================================
  // BAGIAN 1: Simulasi 8 Sel Eksperimen Terkontrol (Pertanyaan Identik Per Pasang)
  // =========================================================================
  console.log("\n--- BAGIAN 1: 8 SEL EKSPERIMEN TERKONTROL ---");
  const results8Cells: MockCellResult[] = [];

  for (const config of MOCK_CONFIGS_8_CELLS) {
    console.log(
      `\n[Sel ${config.cellNumber}] Skenario: ${config.scenarioId} | Kondisi: ${config.condition.toUpperCase()}`
    );

    const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === config.scenarioId)!;
    const { dialogueHistory } = await runDialogue(
      config.scenarioId,
      config.condition,
      config.respondentQuestions
    );

    results8Cells.push({
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

  const path8Cells = path.join(scratchDir, "mock_conversations_8_cells.json");
  fs.writeFileSync(path8Cells, JSON.stringify(results8Cells, null, 2), "utf-8");
  const localCopyPath = path.resolve(process.cwd(), "mock_conversations_8_cells.json");
  fs.writeFileSync(localCopyPath, JSON.stringify(results8Cells, null, 2), "utf-8");
  console.log(`\n Hasil 8 Sel Tersimpan di: ${path8Cells}`);
  console.log(` Salinan lokal tersimpan di: ${localCopyPath}`);

  // =========================================================================
  // BAGIAN 2: Pengujian Khusus Basic Menerima Data Manual
  // =========================================================================
  console.log("\n--- BAGIAN 2: PENGUJIAN BASIC MENERIMA DATA MANUAL ---");
  console.log("[Test Case: Basic + User Memberikan Data Keuangan Manual]");
  const manualQuestions = [
    "Apakah saya aman membeli laptop seharga Rp7.000.000 ini secara tunai sekarang?",
    "Saldo saya saat ini Rp18.000.000, ada tagihan Rp1.800.000 dalam 6 hari ke depan, dan saya ingin mempertahankan dana darurat minimal Rp5.000.000.",
  ];

  const manualResult = await runDialogue("spending_high", "basic", manualQuestions);
  const pathManual = path.join(scratchDir, "mock_manual_data_basic.json");
  fs.writeFileSync(
    pathManual,
    JSON.stringify(
      {
        testCase: "Basic Assistant with User Provided Finances",
        scenarioId: "spending_high",
        dialogueHistory: manualResult.dialogueHistory,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(` Hasil Basic Data Manual Tersimpan di: ${pathManual}`);

  // =========================================================================
  // BAGIAN 3: Pengujian Khusus Perubahan Nominal (Rp 7 Juta -> Rp 14 Juta)
  // =========================================================================
  console.log("\n--- BAGIAN 3: PENGUJIAN PERUBAHAN NOMINAL (Rp 7 Juta -> Rp 14 Juta) ---");
  console.log("[Test Case: Context-Aware + User Mengubah Nominal ke Rp 14.000.000]");
  const nominalQuestions = [
    "Apakah saya aman membeli laptop seharga Rp7.000.000 ini secara tunai sekarang?",
    "Bagaimana jika saya mengganti pilihannya menjadi laptop gaming seharga Rp14.000.000 secara tunai?",
  ];

  const nominalResult = await runDialogue("spending_high", "context_aware", nominalQuestions);
  const pathNominal = path.join(scratchDir, "mock_nominal_change_14jt.json");
  fs.writeFileSync(
    pathNominal,
    JSON.stringify(
      {
        testCase: "Context-Aware with Nominal Modification to 14 Million",
        scenarioId: "spending_high",
        dialogueHistory: nominalResult.dialogueHistory,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(` Hasil Perubahan Nominal Tersimpan di: ${pathNominal}`);

  console.log("\n=================================================================");
  console.log("       SELURUH SIMULASI DAN PENGUJIAN SELESAI DENGAN SUKSES!     ");
  console.log("=================================================================");
}

runMockSimulation().catch((err) => {
  console.error("Gagal menjalankan simulasi:", err);
  process.exit(1);
});
