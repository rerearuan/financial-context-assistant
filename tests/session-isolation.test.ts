import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "@/db";
import { sessions, messages, simulatedTransactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateSafeFallbackResponse } from "@/lib/gemini";
import { buildStructuredContextPacket } from "@/lib/financial-engine/context-packager";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { FinancialAction, FinancialProfileContext } from "@/lib/financial-engine/types";

describe("Session Isolation & Security", () => {
  const sessionAId = "test_ses_isolation_A";
  const sessionBId = "test_ses_isolation_B";

  beforeAll(async () => {
    // Clean up test sessions if they exist
    await db.delete(simulatedTransactions).where(eq(simulatedTransactions.sessionId, sessionAId));
    await db.delete(simulatedTransactions).where(eq(simulatedTransactions.sessionId, sessionBId));
    await db.delete(messages).where(eq(messages.sessionId, sessionAId));
    await db.delete(messages).where(eq(messages.sessionId, sessionBId));
    await db.delete(sessions).where(eq(sessions.id, sessionAId));
    await db.delete(sessions).where(eq(sessions.id, sessionBId));

    // Create session A (Basic, spending_low)
    await db.insert(sessions).values({
      id: sessionAId,
      participantCode: "P-ISO-A",
      scenarioId: "spending_low",
      condition: "basic",
      currentAction: {
        type: "spending",
        amount: 3500000,
        timing: "Minggu ini",
        targetCategory: "Gadget",
        description: "Ponsel",
      },
      status: "in_progress",
      modelId: "gemini-3.5-flash-lite",
    });

    // Create session B (Context-Aware, spending_high)
    await db.insert(sessions).values({
      id: sessionBId,
      participantCode: "P-ISO-B",
      scenarioId: "spending_high",
      condition: "context_aware",
      currentAction: {
        type: "spending",
        amount: 3500000,
        timing: "Minggu ini",
        targetCategory: "Gadget",
        description: "Ponsel",
      },
      status: "in_progress",
      modelId: "gemini-3.5-flash-lite",
    });

    // Insert messages into Session A
    await db.insert(messages).values({
      id: "msg_iso_A1",
      sessionId: sessionAId,
      role: "user",
      content: "Pesan rahasia dari partisipan A",
    });

    // Insert messages into Session B
    await db.insert(messages).values({
      id: "msg_iso_B1",
      sessionId: sessionBId,
      role: "user",
      content: "Pesan rahasia dari partisipan B",
    });
  });

  afterAll(async () => {
    await db.delete(simulatedTransactions).where(eq(simulatedTransactions.sessionId, sessionAId));
    await db.delete(simulatedTransactions).where(eq(simulatedTransactions.sessionId, sessionBId));
    await db.delete(messages).where(eq(messages.sessionId, sessionAId));
    await db.delete(messages).where(eq(messages.sessionId, sessionBId));
    await db.delete(sessions).where(eq(sessions.id, sessionAId));
    await db.delete(sessions).where(eq(sessions.id, sessionBId));
  });

  it("ensures messages of Session A and Session B never cross-contaminate", async () => {
    const messagesA = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionAId));
    const messagesB = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionBId));

    expect(messagesA.length).toBe(1);
    expect(messagesA[0].content).toBe("Pesan rahasia dari partisipan A");
    expect(messagesB.length).toBe(1);
    expect(messagesB[0].content).toBe("Pesan rahasia dari partisipan B");

    // Check that neither query returns any message belonging to the other session
    expect(messagesA.find((m) => m.content.includes("partisipan B"))).toBeUndefined();
    expect(messagesB.find((m) => m.content.includes("partisipan A"))).toBeUndefined();
  });

  it("ensures fallback mechanism generates deterministic responses without leaking other sessions", () => {
    const pkg = SCENARIO_PACKAGES[1]; // spending_high
    const action: FinancialAction = {
      ...pkg.scenario.initialAction,
      source: "scenario",
    };
    const profileContext: FinancialProfileContext = {
      ...pkg.syntheticProfile,
      source: "synthetic_profile",
    };

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: profileContext,
    });

    const fallbackReply = generateSafeFallbackResponse(packet, "Apakah aman?");
    // Must contain high conflict deficit details for session B
    expect(fallbackReply).toContain("1.700.000"); // balanceAfterAction
    expect(fallbackReply).toContain("2.500.000"); // budget deficit
    expect(fallbackReply).toContain("defisit sebesar Rp 1.400.000"); // deficit amount

    // Must NOT contain details from session A (e.g. 12.000.000 or 8.500.000)
    expect(fallbackReply).not.toContain("12.000.000");
    expect(fallbackReply).not.toContain("8.500.000");
  });

  it("recalculation is strictly triggered when nominal is modified", () => {
    const pkg = SCENARIO_PACKAGES[0];
    const initialAction: FinancialAction = {
      ...pkg.scenario.initialAction,
      amount: 3500000,
      source: "scenario",
    };
    const profileContext: FinancialProfileContext = {
      ...pkg.syntheticProfile,
      source: "synthetic_profile",
    };

    const initialPacket = buildStructuredContextPacket({
      condition: "context_aware",
      action: initialAction,
      syntheticProfile: profileContext,
    });
    expect(initialPacket.calculation.balanceAfterAction).toBe(8500000);
    expect(initialPacket.calculation.budgetVariance).toBe(500000);

    // User modifies amount to Rp 2.800.000
    const modifiedAction: FinancialAction = {
      ...initialAction,
      amount: 2800000,
      source: "user_message",
    };
    const updatedPacket = buildStructuredContextPacket({
      condition: "context_aware",
      action: modifiedAction,
      syntheticProfile: profileContext,
    });

    // Recalculated balance: 12.000.000 - 2.800.000 = 9.200.000
    expect(updatedPacket.calculation.balanceAfterAction).toBe(9200000);
    // Recalculated budget variance: 4.000.000 - 2.800.000 = 1.200.000 surplus
    expect(updatedPacket.calculation.budgetVariance).toBe(1200000);
  });

  it("verifies simulated transaction records only simulation data without payment integration", async () => {
    const txId = "tx_test_simulated_01";
    await db.insert(simulatedTransactions).values({
      id: txId,
      sessionId: sessionAId,
      actionType: "spending",
      amount: 3500000,
      decisionStatus: "proceed",
      userNotes: "Simulasi partisipan A",
      snapshotData: {
        simulationOnly: true,
        realMoneyMoved: false,
      },
    });

    const [tx] = await db
      .select()
      .from(simulatedTransactions)
      .where(eq(simulatedTransactions.id, txId));

    expect(tx).toBeDefined();
    expect(tx.decisionStatus).toBe("proceed");
    expect(tx.snapshotData).toEqual({
      simulationOnly: true,
      realMoneyMoved: false,
    });

    await db.delete(simulatedTransactions).where(eq(simulatedTransactions.id, txId));
  });
});
