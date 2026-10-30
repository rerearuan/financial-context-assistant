import crypto from "crypto";
import { db } from "@/db";
import { sessions, scenarios, messages } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { EXPERIMENT_CELLS } from "./randomizer";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { demoSessions, demoMessages, DemoSession, DemoMessage } from "./demo-store";
import { PROMPT_VERSION } from "./prompts/templates";
import { getGeminiModel } from "./gemini";

export interface SessionMetadata {
  scenarioId: string;
  condition: "basic" | "context_aware";
  cellNumber?: number;
}

/**
 * Generate a self-healing session ID that securely embeds cell/scenario knowledge.
 * Format: ses_c{cellNum}_{randomHex}
 */
export function generateSessionId(
  cellNumber?: number | null,
  scenarioId?: string | null,
  condition?: "basic" | "context_aware" | null
): string {
  if (cellNumber && cellNumber >= 1 && cellNumber <= 8) {
    return `ses_c${cellNumber}_${crypto.randomBytes(10).toString("hex")}`;
  }

  if (scenarioId && condition) {
    const matched = EXPERIMENT_CELLS.find(
      (c) => c.scenarioId === scenarioId && c.condition === condition
    );
    if (matched) {
      return `ses_c${matched.cellNumber}_${crypto.randomBytes(10).toString("hex")}`;
    }
    return `ses_${scenarioId}_${condition}_${crypto.randomBytes(8).toString("hex")}`;
  }

  return `ses_${crypto.randomBytes(16).toString("hex")}`;
}

/**
 * Resolve scenario and condition from sessionId or fallback cell parameters.
 */
export function resolveSessionMetadata(
  sessionId: string,
  fallbackCell?: number | string | null
): SessionMetadata | null {
  // 1. Check ses_c[1-8]_ pattern
  const cMatch = sessionId.match(/^ses_c([1-8])_/);
  if (cMatch) {
    const cellNum = parseInt(cMatch[1], 10);
    const matched = EXPERIMENT_CELLS.find((c) => c.cellNumber === cellNum);
    if (matched) {
      return {
        scenarioId: matched.scenarioId,
        condition: matched.condition,
        cellNumber: matched.cellNumber,
      };
    }
  }

  // 2. Check ses_[scenario]_[condition]_ pattern
  const scMatch = sessionId.match(
    /^ses_(spending_low|spending_high|saving_low|saving_high)_(basic|context_aware)_/
  );
  if (scMatch) {
    return {
      scenarioId: scMatch[1],
      condition: scMatch[2] as "basic" | "context_aware",
    };
  }

  // 3. Check dev_[scenario]_[condition] pattern
  const devMatch = sessionId.match(/^dev_(.+?)_(basic|context_aware)$/);
  if (devMatch) {
    return {
      scenarioId: devMatch[1],
      condition: devMatch[2] as "basic" | "context_aware",
    };
  }

  // 4. Check fallback cell number (e.g. from query param or header)
  if (fallbackCell !== undefined && fallbackCell !== null && fallbackCell !== "") {
    const cellNum = Number(fallbackCell);
    if (!isNaN(cellNum) && cellNum >= 1 && cellNum <= 8) {
      const matched = EXPERIMENT_CELLS.find((c) => c.cellNumber === cellNum);
      if (matched) {
        return {
          scenarioId: matched.scenarioId,
          condition: matched.condition,
          cellNumber: matched.cellNumber,
        };
      }
    }
  }

  return null;
}

/**
 * Retrieves an existing session from DB or demo-store, or automatically restores/creates
 * a self-healing session if serverless cold-start or sleep cleared the memory.
 */
export async function getOrRestoreSession(
  sessionId: string,
  fallbackCell?: number | string | null
): Promise<DemoSession | null> {
  // 1. Try DB first
  try {
    const [dbSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (dbSession) {
      return {
        id: dbSession.id,
        participantCode: dbSession.participantCode,
        scenarioId: dbSession.scenarioId,
        condition: dbSession.condition as "basic" | "context_aware",
        currentAction: (dbSession.currentAction as Record<string, unknown>) || {},
        status: dbSession.status,
        followupCount: dbSession.followupCount,
        maxFollowupAllowed: dbSession.maxFollowupAllowed,
        promptVersion: dbSession.promptVersion,
        modelId: dbSession.modelId,
      };
    }
  } catch (dbErr) {
    console.warn("DB lookup failed in getOrRestoreSession, using fallback:", dbErr);
  }

  // 2. Try demo store
  const existingDemo = demoSessions.get(sessionId);
  if (existingDemo) {
    return existingDemo;
  }

  // 3. Self-healing recovery
  const meta = resolveSessionMetadata(sessionId, fallbackCell);
  if (!meta) {
    return null;
  }

  const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === meta.scenarioId);
  if (!pkg) {
    return null;
  }

  const recoveredSession: DemoSession = {
    id: sessionId,
    participantCode: `P-${sessionId.slice(-6).toUpperCase()}`,
    scenarioId: meta.scenarioId,
    condition: meta.condition,
    currentAction: pkg.scenario.initialAction as unknown as Record<string, unknown>,
    status: "in_progress",
    followupCount: 0,
    maxFollowupAllowed: 4,
    promptVersion: PROMPT_VERSION,
    modelId: getGeminiModel(),
  };

  demoSessions.set(sessionId, recoveredSession);

  // Initialize initial assistant message if not present
  if (!demoMessages.has(sessionId)) {
    const initialContent =
      pkg.scenario.initialAssistantMessage ||
      "Halo! Saya asisten finansial Anda. Ada keputusan atau rencana keuangan yang ingin Anda konsultasikan hari ini?";
    const initialMsg: DemoMessage = {
      id: `msg_init_${sessionId}`,
      sessionId,
      role: "assistant",
      content: initialContent,
      createdAt: new Date(),
      sourcesUsed:
        meta.condition === "context_aware"
          ? ["scenario", "synthetic_profile"]
          : ["scenario"],
    };
    demoMessages.set(sessionId, [initialMsg]);
  }

  return recoveredSession;
}

/**
 * Restores client-side chat history if server memory was wiped during idle/sleep.
 */
export function restoreChatHistory(
  sessionId: string,
  clientHistory?: Array<{ role: "user" | "assistant"; content: string; id?: string }>
) {
  if (!clientHistory || clientHistory.length === 0) return;

  const currentMsgs = demoMessages.get(sessionId) || [];
  // If server has fewer messages than the client provided, restore from client history
  if (currentMsgs.length < clientHistory.length) {
    const restored: DemoMessage[] = clientHistory.map((m, idx) => ({
      id: m.id || `restored_${sessionId}_${idx}`,
      sessionId,
      role: m.role,
      content: m.content,
      createdAt: new Date(),
    }));
    demoMessages.set(sessionId, restored);
  }
}
