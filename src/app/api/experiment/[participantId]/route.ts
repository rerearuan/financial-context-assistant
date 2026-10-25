import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { participants, scenarios, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ participantId: string }> }
) {
  try {
    const { participantId } = await params;

    const [part] = await db
      .select()
      .from(participants)
      .where(eq(participants.id, participantId));

    if (!part) {
      return NextResponse.json({ error: "Partisipan tidak ditemukan" }, { status: 404 });
    }

    let scenarioData = null;
    if (part.scenarioId) {
      const [sc] = await db
        .select()
        .from(scenarios)
        .where(eq(scenarios.id, part.scenarioId));
      scenarioData = sc;
    }

    let sessionData = null;
    if (part.sessionId) {
      const [sess] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, part.sessionId));
      sessionData = sess;
    }

    return NextResponse.json({
      participant: part,
      scenario: scenarioData,
      session: sessionData,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
