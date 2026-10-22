import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { db } from "./index";
import { scenarios, syntheticProfiles, sessions, messages } from "./schema";
import { SCENARIO_PACKAGES } from "../fixtures/scenarios";
import { eq } from "drizzle-orm";
import { getGeminiModel } from "../lib/gemini";

export async function runSeed() {
  console.log("Seeding database scenarios and synthetic profiles...");
  const modelId = getGeminiModel();

  for (const pkg of SCENARIO_PACKAGES) {
    // 1. Upsert Scenario
    const existingScenario = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.id, pkg.scenario.id));

    if (existingScenario.length === 0) {
      await db.insert(scenarios).values({
        id: pkg.scenario.id,
        code: pkg.scenario.code,
        title: pkg.scenario.title,
        actionType: pkg.scenario.actionType,
        conflictLevel: pkg.scenario.conflictLevel,
        descriptionText: pkg.scenario.descriptionText,
        initialAction: pkg.scenario.initialAction,
        initialAssistantMessage: pkg.scenario.initialAssistantMessage,
        quickReplies: pkg.scenario.quickReplies,
      });
      console.log(`- Inserted scenario: ${pkg.scenario.id}`);
    } else {
      await db
        .update(scenarios)
        .set({
          title: pkg.scenario.title,
          descriptionText: pkg.scenario.descriptionText,
          initialAction: pkg.scenario.initialAction,
          initialAssistantMessage: pkg.scenario.initialAssistantMessage,
          quickReplies: pkg.scenario.quickReplies,
        })
        .where(eq(scenarios.id, pkg.scenario.id));
      console.log(`- Updated scenario: ${pkg.scenario.id}`);
    }

    // 2. Upsert Synthetic Profile
    const existingProfile = await db
      .select()
      .from(syntheticProfiles)
      .where(eq(syntheticProfiles.id, pkg.syntheticProfile.id));

    if (existingProfile.length === 0) {
      await db.insert(syntheticProfiles).values({
        id: pkg.syntheticProfile.id,
        scenarioId: pkg.scenario.id,
        totalCashBalance: pkg.syntheticProfile.totalCashBalance,
        liquidBalance: pkg.syntheticProfile.liquidBalance,
        budgets: pkg.syntheticProfile.budgets,
        liabilities: pkg.syntheticProfile.liabilities,
        goals: pkg.syntheticProfile.goals,
        buffer: pkg.syntheticProfile.buffer,
        incomeSchedule: pkg.syntheticProfile.incomeSchedule,
      });
      console.log(`- Inserted synthetic profile: ${pkg.syntheticProfile.id}`);
    } else {
      await db
        .update(syntheticProfiles)
        .set({
          totalCashBalance: pkg.syntheticProfile.totalCashBalance,
          liquidBalance: pkg.syntheticProfile.liquidBalance,
          budgets: pkg.syntheticProfile.budgets,
          liabilities: pkg.syntheticProfile.liabilities,
          goals: pkg.syntheticProfile.goals,
          buffer: pkg.syntheticProfile.buffer,
          incomeSchedule: pkg.syntheticProfile.incomeSchedule,
        })
        .where(eq(syntheticProfiles.id, pkg.syntheticProfile.id));
      console.log(`- Updated synthetic profile: ${pkg.syntheticProfile.id}`);
    }
  }

  // 3. Seed Dev Preview Sessions (8 combinations)
  const conditions: Array<"basic" | "context_aware"> = [
    "basic",
    "context_aware",
  ];

  for (const pkg of SCENARIO_PACKAGES) {
    for (const cond of conditions) {
      const sessionId = `dev_${pkg.scenario.id}_${cond}`;
      const participantCode = `DEV-P-${cond === "basic" ? "BAS" : "CTX"}-${pkg.scenario.id}`;

      const existingSession = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId));

      if (existingSession.length === 0) {
        await db.insert(sessions).values({
          id: sessionId,
          participantCode,
          scenarioId: pkg.scenario.id,
          condition: cond,
          currentAction: pkg.scenario.initialAction,
          status: "in_progress",
          followupCount: 0,
          maxFollowupAllowed: 2,
          promptVersion: "v1.0",
          modelId,
        });

        // Insert initial assistant message
        const initialMsgId = `msg_init_${sessionId}`;
        await db.insert(messages).values({
          id: initialMsgId,
          sessionId,
          role: "assistant",
          content: pkg.scenario.initialAssistantMessage,
          sourcesUsed: cond === "context_aware" ? ["scenario", "synthetic_profile"] : ["scenario"],
        });

        console.log(`- Seeded dev session: ${sessionId} (${cond})`);
      }
    }
  }

  console.log("Database seeding completed successfully.");
}

if (process.argv[1]?.endsWith("seed.ts")) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
