import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/sessions/route";
import { NextRequest } from "next/server";
import { EXPERIMENT_CELLS } from "@/lib/randomizer";

describe("Direct Cell Sessions for Manipulation Check (/c/1 - /c/8)", () => {
  it("creates valid sessions for each of the 8 cells", async () => {
    for (let cellNum = 1; cellNum <= 8; cellNum++) {
      const matched = EXPERIMENT_CELLS.find((c) => c.cellNumber === cellNum)!;
      const req = new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cellNumber: cellNum,
          source: "form",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.sessionId).toBeDefined();
      expect(data.sessionId.startsWith("ses_")).toBe(true);
      expect(data.cellNumber).toBe(cellNum);
      expect(data.scenarioId).toBe(matched.scenarioId);
      expect(data.condition).toBe(matched.condition);
      expect(data.initialMessage?.content).toBeTruthy();
    }
  });

  it("rejects invalid cell numbers", async () => {
    const invalidReq = new NextRequest("http://localhost:3000/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cellNumber: 99,
      }),
    });

    const res = await POST(invalidReq);
    expect(res.status).toBe(400);
  });
});
