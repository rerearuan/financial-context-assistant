import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { participants, scenarios, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { demoParticipants, demoSessions } from "@/lib/demo-store";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ participantId: string }> }
) {
  const { participantId } = await params;

  try {
    const [part] = await db
      .select()
      .from(participants)
      .where(eq(participants.id, participantId));

    if (part) {
      let scenarioData = null;
      if (part.scenarioId) {
        const [sc] = await db
          .select()
          .from(scenarios)
          .where(eq(scenarios.id, part.scenarioId));
        if (sc) {
          const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === part.scenarioId);
          scenarioData = {
            ...sc,
            comprehensionQuestions: sc.comprehensionQuestions || pkg?.scenario.comprehensionQuestions || [],
          };
        }
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
    }
  } catch (err) {
    console.warn("DB not reachable in /api/experiment/[participantId], trying demo memory:", err);
  }

  // Fallback to demo memory
  const demoPart = demoParticipants.get(participantId);
  if (demoPart) {
    let scenarioData = null;
    if (demoPart.scenarioId) {
      const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === demoPart.scenarioId);
      scenarioData = pkg?.scenario || null;
    }

    const sessionData = demoPart.sessionId ? demoSessions.get(demoPart.sessionId) || null : null;

    return NextResponse.json({
      participant: demoPart,
      scenario: scenarioData,
      session: sessionData,
      isDemoMode: true,
    });
  }

  return NextResponse.json({ error: "Partisipan tidak ditemukan" }, { status: 404 });
}
