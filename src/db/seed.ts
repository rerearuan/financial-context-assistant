import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { db } from "./index";
import { scenarios, syntheticProfiles, sessions, messages } from "./schema";
import { SCENARIO_PACKAGES } from "../fixtures/scenarios";
import { eq } from "drizzle-orm";
import { getGeminiModel } from "../lib/gemini";

export async function runSeed() {
  console.log("Seeding database scenarios and synthetic profiles from research instrument PDF...");
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
        situasiText: pkg.scenario.situasiText,
        kondisiKeuanganText: pkg.scenario.kondisiKeuanganText,
        tugasText: pkg.scenario.tugasText,
        descriptionText: pkg.scenario.descriptionText,
        initialAction: pkg.scenario.initialAction,
        initialAssistantMessage: pkg.scenario.initialAssistantMessage,
        quickReplies: pkg.scenario.quickReplies,
        tugasQuestions: pkg.scenario.tugasQuestions,
      });
      console.log(`- Inserted scenario: ${pkg.scenario.id}`);
    } else {
      await db
        .update(scenarios)
        .set({
          code: pkg.scenario.code,
          title: pkg.scenario.title,
          actionType: pkg.scenario.actionType,
          conflictLevel: pkg.scenario.conflictLevel,
          situasiText: pkg.scenario.situasiText,
          kondisiKeuanganText: pkg.scenario.kondisiKeuanganText,
          tugasText: pkg.scenario.tugasText,
          descriptionText: pkg.scenario.descriptionText,
          initialAction: pkg.scenario.initialAction,
          initialAssistantMessage: pkg.scenario.initialAssistantMessage,
          quickReplies: pkg.scenario.quickReplies,
          tugasQuestions: pkg.scenario.tugasQuestions,
        })
        .where(eq(scenarios.id, pkg.scenario.id));
      console.log(`- Updated scenario: ${pkg.scenario.id}`);
    }

    // 2. Upsert Synthetic Profile
    const profId = pkg.syntheticProfile.id || `prof_${pkg.scenario.id}`;
    const existingProfile = await db
      .select()
      .from(syntheticProfiles)
      .where(eq(syntheticProfiles.id, profId));

    if (existingProfile.length === 0) {
      await db.insert(syntheticProfiles).values({
        id: profId,
        scenarioId: pkg.scenario.id,
        totalCashBalance: pkg.syntheticProfile.totalCashBalance,
        liquidBalance: pkg.syntheticProfile.liquidBalance,
        budgets: pkg.syntheticProfile.budgets as any,
        liabilities: pkg.syntheticProfile.liabilities as any,
        goals: pkg.syntheticProfile.goals as any,
        buffer: pkg.syntheticProfile.buffer as any,
        incomeSchedule: pkg.syntheticProfile.incomeSchedule as any,
      });
      console.log(`- Inserted synthetic profile: ${profId}`);
    } else {
      await db
        .update(syntheticProfiles)
        .set({
          totalCashBalance: pkg.syntheticProfile.totalCashBalance,
          liquidBalance: pkg.syntheticProfile.liquidBalance,
          budgets: pkg.syntheticProfile.budgets as any,
          liabilities: pkg.syntheticProfile.liabilities as any,
          goals: pkg.syntheticProfile.goals as any,
          buffer: pkg.syntheticProfile.buffer as any,
          incomeSchedule: pkg.syntheticProfile.incomeSchedule as any,
        })
        .where(eq(syntheticProfiles.id, profId));
      console.log(`- Updated synthetic profile: ${profId}`);
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
      } else {
        // Update current action and message in existing dev session
        await db
          .update(sessions)
          .set({
            currentAction: pkg.scenario.initialAction,
          })
          .where(eq(sessions.id, sessionId));

        const initialMsgId = `msg_init_${sessionId}`;
        await db
          .update(messages)
          .set({
            content: pkg.scenario.initialAssistantMessage,
          })
          .where(eq(messages.id, initialMsgId));
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
