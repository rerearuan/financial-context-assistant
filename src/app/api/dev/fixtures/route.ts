import { NextResponse } from "next/server";
import { db } from "@/db";
import { scenarios, syntheticProfiles, sessions } from "@/db/schema";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allScenarios = await db.select().from(scenarios);
    const allProfiles = await db.select().from(syntheticProfiles);
    const allSessions = await db.select().from(sessions);

    const devSessions = allSessions.filter((s) => s.id.startsWith("dev_"));

    return NextResponse.json({
      dbConnected: true,
      scenarios: allScenarios.length > 0 ? allScenarios : SCENARIO_PACKAGES.map((pkg) => pkg.scenario),
      profiles: allProfiles.length > 0 ? allProfiles : SCENARIO_PACKAGES.map((pkg) => pkg.syntheticProfile),
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
    console.warn("DB not reachable in /api/dev/fixtures, falling back to static fixtures:", msg);

    return NextResponse.json({
      dbConnected: false,
      dbError: msg,
      scenarios: SCENARIO_PACKAGES.map((pkg) => pkg.scenario),
      profiles: SCENARIO_PACKAGES.map((pkg) => pkg.syntheticProfile),
      devSessions: [],
      fixtures: SCENARIO_PACKAGES.map((pkg) => ({
        id: pkg.scenario.id,
        title: pkg.scenario.title,
        conflictLevel: pkg.scenario.conflictLevel,
        expectedCalculations: pkg.expectedCalculations,
      })),
    });
  }
}
