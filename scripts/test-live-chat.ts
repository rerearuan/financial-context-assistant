import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { db } from "../src/db";
import { sessions, syntheticProfiles } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { extractIntent, generateAssistantResponse } from "../src/lib/gemini";
import { buildStructuredContextPacket } from "../src/lib/financial-engine/context-packager";

async function runLiveChatTurn() {
  console.log("=== Testing Live Chat on dev_spending_high_context_aware ===");
  const [sessionCtx] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, "dev_spending_high_context_aware"));

  const [profileCtx] = await db
    .select()
    .from(syntheticProfiles)
    .where(eq(syntheticProfiles.scenarioId, sessionCtx.scenarioId));

  const packetCtx = buildStructuredContextPacket({
    condition: "context_aware",
    action: {
      type: sessionCtx.currentAction.type,
      amount: sessionCtx.currentAction.amount,
      timing: sessionCtx.currentAction.timing,
      targetCategory: sessionCtx.currentAction.targetCategory,
      description: sessionCtx.currentAction.description,
      source: "scenario",
    },
    syntheticProfile: {
      ...profileCtx,
      source: "synthetic_profile",
    } as any,
  });

  const userQuery = "Apakah aman membeli ponsel ini minggu ini?";
  console.log(`User query: "${userQuery}"`);

  const intent = await extractIntent(userQuery, packetCtx.action);
  console.log("Extracted intent:", JSON.stringify(intent));

  const resCtx = await generateAssistantResponse(packetCtx, userQuery, [
    { role: "assistant", content: sessionCtx.currentAction.description },
  ]);

  console.log("\nContext-Aware Assistant Reply:\n" + resCtx.content);
  console.log("Fallback used:", resCtx.isFallback);

  console.log("\n=== Testing Live Chat on dev_spending_high_basic ===");
  const [sessionBas] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, "dev_spending_high_basic"));

  const packetBas = buildStructuredContextPacket({
    condition: "basic",
    action: {
      type: sessionBas.currentAction.type,
      amount: sessionBas.currentAction.amount,
      timing: sessionBas.currentAction.timing,
      targetCategory: sessionBas.currentAction.targetCategory,
      description: sessionBas.currentAction.description,
      source: "scenario",
    },
    syntheticProfile: null, // strictly null
  });

  const resBas = await generateAssistantResponse(packetBas, userQuery, [
    { role: "assistant", content: sessionBas.currentAction.description },
  ]);

  console.log("\nBasic Assistant Reply:\n" + resBas.content);
  console.log("Fallback used:", resBas.isFallback);
}

runLiveChatTurn()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
