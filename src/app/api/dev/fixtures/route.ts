import { NextResponse } from "next/server";
import { db } from "@/db";
import { scenarios, syntheticProfiles, sessions } from "@/db/schema";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allScenarios = await db.select().from(scenarios);
    const allProfiles = await db.select().from(syntheticProfiles);
    const allSessions = await db.select().from(sessions);

    const devSessions = allSessions.filter((s) => s.id.startsWith("dev_"));

    return NextResponse.json({
      scenarios: allScenarios,
      profiles: allProfiles,
      devSessions,
      fixtures: SCENARIO_PACKAGES.map((pkg) => ({
        id: pkg.scenario.id,
        title: pkg.scenario.title,
        conflictLevel: pkg.scenario.conflictLevel,
        expectedCalculations: pkg.expectedCalculations,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
