import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, scenarios, messages, syntheticProfiles } from "@/db/schema";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { eq, asc } from "drizzle-orm";
import { demoSessions, demoMessages } from "@/lib/demo-store";

export const dynamic = "force-dynamic";

function getDevFallbackSession(sessionId: string) {
  const match = sessionId.match(/^dev_(.+?)_(basic|context_aware)$/);
  if (!match) return null;
  const scenarioId = match[1];
  const condition = match[2] as "basic" | "context_aware";
  const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === scenarioId);
  if (!pkg) return null;

  return {
    sessionId,
    participantCode: `DEV-${scenarioId.toUpperCase()}`,
    scenarioId: pkg.scenario.id,
    condition,
    status: "in_progress",
    currentAction: pkg.scenario.initialAction,
    followupCount: 0,
    maxFollowupAllowed: 5,
    scenario: {
      id: pkg.scenario.id,
      title: pkg.scenario.title,
      actionType: pkg.scenario.actionType,
      descriptionText: pkg.scenario.descriptionText,
      situasiText: pkg.scenario.situasiText,
      kondisiKeuanganText: pkg.scenario.kondisiKeuanganText,
      tugasText: pkg.scenario.tugasText,
      quickReplies: pkg.scenario.quickReplies || [],
    },
    messages: [],
    devProfile: condition === "context_aware" ? pkg.syntheticProfile : null,
  };
}

function getDemoSessionResponse(sessionId: string) {
  const demoSess = demoSessions.get(sessionId);
  if (!demoSess) return null;

  const pkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === demoSess.scenarioId);
  const msgs = demoMessages.get(sessionId) || [];

  return {
    sessionId: demoSess.id,
    participantCode: demoSess.participantCode,
    scenarioId: demoSess.scenarioId,
    condition: demoSess.condition,
    status: demoSess.status,
    currentAction: demoSess.currentAction,
    followupCount: demoSess.followupCount,
    maxFollowupAllowed: demoSess.maxFollowupAllowed,
    scenario: {
      id: pkg?.scenario.id,
      title: pkg?.scenario.title,
      actionType: pkg?.scenario.actionType,
      descriptionText: pkg?.scenario.descriptionText,
      situasiText: pkg?.scenario.situasiText,
      kondisiKeuanganText: pkg?.scenario.kondisiKeuanganText,
      tugasText: pkg?.scenario.tugasText,
      quickReplies: pkg?.scenario.quickReplies || [],
    },
    messages: msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      calculationSnapshot: m.calculationSnapshot,
      sourcesUsed: m.sourcesUsed,
    })),
    devProfile: demoSess.condition === "context_aware" ? pkg?.syntheticProfile : undefined,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (!session) {
      const demoResponse = getDemoSessionResponse(sessionId);
      if (demoResponse) return NextResponse.json(demoResponse);

      const fallback = getDevFallbackSession(sessionId);
      if (fallback) return NextResponse.json(fallback);

      return NextResponse.json(
        { error: "Sesi tidak ditemukan." },
        { status: 404 }
      );
    }

    const [scenario] = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.id, session.scenarioId));

    const messageList = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt));

    const isDev = req.nextUrl.searchParams.get("dev") === "true";
    let devProfile = null;
    if (isDev && session.condition === "context_aware") {
      const [profile] = await db
        .select()
        .from(syntheticProfiles)
        .where(eq(syntheticProfiles.scenarioId, session.scenarioId));
      devProfile = profile;
    }

    return NextResponse.json({
      sessionId: session.id,
      participantCode: session.participantCode,
      scenarioId: session.scenarioId,
      condition: session.condition,
      status: session.status,
      currentAction: session.currentAction,
      followupCount: session.followupCount,
      maxFollowupAllowed: session.maxFollowupAllowed,
      scenario: {
        id: scenario?.id,
        title: scenario?.title,
        actionType: scenario?.actionType,
        descriptionText: scenario?.descriptionText,
        situasiText: scenario?.situasiText,
        kondisiKeuanganText: scenario?.kondisiKeuanganText,
        tugasText: scenario?.tugasText,
        quickReplies: scenario?.quickReplies || [],
      },
      messages: messageList.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        calculationSnapshot: m.calculationSnapshot,
        sourcesUsed: m.sourcesUsed,
      })),
      devProfile: isDev ? devProfile : undefined,
    });
  } catch (err: unknown) {
    const demoResponse = getDemoSessionResponse(sessionId);
    if (demoResponse) return NextResponse.json(demoResponse);

    const fallback = getDevFallbackSession(sessionId);
    if (fallback) return NextResponse.json(fallback);

    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
