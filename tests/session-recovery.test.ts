import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/sessions/[sessionId]/route";
import { POST as chatPOST } from "@/app/api/sessions/[sessionId]/chat/route";
import { NextRequest } from "next/server";
import { demoSessions, demoMessages } from "@/lib/demo-store";
import { generateSessionId } from "@/lib/session-resolver";

describe("Serverless Session Persistence & Self-Healing", () => {
  it("restores session seamlessly via GET when in-memory RAM is wiped (cold start/sleep)", async () => {
    // 1. Generate session ID for cell 2 (spending_low, context_aware)
    const sessionId = generateSessionId(2, "spending_low", "context_aware");
    expect(sessionId.startsWith("ses_c2_")).toBe(true);

    // 2. Clear in-memory demoSessions to simulate Vercel serverless sleep/reboot
    demoSessions.delete(sessionId);
    demoMessages.delete(sessionId);
    expect(demoSessions.has(sessionId)).toBe(false);

    // 3. User reloads or fetches session after server sleep
    const req = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}`);
    const res = await GET(req, { params: Promise.resolve({ sessionId }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionId).toBe(sessionId);
    expect(data.scenarioId).toBe("spending_low");
    expect(data.condition).toBe("context_aware");
    expect(data.scenario).toBeDefined();
    expect(data.messages).toBeDefined();
    expect(data.messages.length).toBeGreaterThan(0);
  });

  it("restores session and accepts chat messages seamlessly when in-memory RAM is wiped", async () => {
    // 1. Generate session ID for cell 5 (saving_low, basic)
    const sessionId = generateSessionId(5, "saving_low", "basic");
    expect(sessionId.startsWith("ses_c5_")).toBe(true);

    // 2. Clear memory (server sleep simulation)
    demoSessions.delete(sessionId);
    demoMessages.delete(sessionId);
    expect(demoSessions.has(sessionId)).toBe(false);

    // 3. User sends a message after server woke up from sleep
    const chatReq = new NextRequest(`http://localhost:3000/api/sessions/${sessionId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Bagaimana jika saya menabung 1 juta?",
        chatHistory: [
          { role: "assistant", content: "Halo! Saya asisten finansial Anda." },
        ],
      }),
    });

    const res = await chatPOST(chatReq, { params: Promise.resolve({ sessionId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reply || data.assistantMessage).toBeTruthy();
    expect(demoSessions.has(sessionId)).toBe(true);
  });

  it("restores legacy sessions via fallback cell header if cell tag is not in ID", async () => {
    // Opaque legacy ID without _c
    const legacySessionId = "ses_legacy_sleep_test_123456789";
    demoSessions.delete(legacySessionId);
    demoMessages.delete(legacySessionId);

    const req = new NextRequest(`http://localhost:3000/api/sessions/${legacySessionId}?cell=4`, {
      headers: { "x-session-cell": "4" },
    });
    const res = await GET(req, { params: Promise.resolve({ sessionId: legacySessionId }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scenarioId).toBe("spending_high");
    expect(data.condition).toBe("context_aware");
  });
});
