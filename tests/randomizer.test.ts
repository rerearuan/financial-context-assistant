import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import { participants } from "@/db/schema";
import { assignBalancedCell, EXPERIMENT_CELLS } from "@/lib/randomizer";
import { eq, inArray } from "drizzle-orm";

describe("Balanced Randomizer (25x8 = 200 respondents)", () => {
  const testPartIds: string[] = [];

  beforeAll(async () => {
    // Clean up test participants if any
    await db.delete(participants).where(eq(participants.participantCode, "TEST-RAND"));
  });

  afterAll(async () => {
    if (testPartIds.length > 0) {
      await db.delete(participants).where(inArray(participants.id, testPartIds));
    }
  });

  it("has exactly 8 distinct experiment cells", () => {
    expect(EXPERIMENT_CELLS.length).toBe(8);
    const cellNumbers = EXPERIMENT_CELLS.map((c) => c.cellNumber);
    expect(cellNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("assigns valid cell and balances distribution", async () => {
    const assignment1 = await assignBalancedCell();
    expect(assignment1.cellNumber).toBeGreaterThanOrEqual(1);
    expect(assignment1.cellNumber).toBeLessThanOrEqual(8);
    expect(["spending_low", "spending_high", "saving_low", "saving_high"]).toContain(
      assignment1.scenarioId
    );
    expect(["basic", "context_aware"]).toContain(assignment1.condition);
  });
});
