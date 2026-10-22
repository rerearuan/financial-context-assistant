import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, scenarios, messages, syntheticProfiles } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (!session) {
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

    // For dev inspection only (if requested via query ?dev=true)
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
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
