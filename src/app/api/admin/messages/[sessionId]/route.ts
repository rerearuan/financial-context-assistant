import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/admin-auth";
import { db } from "@/db";
import { messages, sessions, participants } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { demoMessages, demoSessions, demoParticipants } from "@/lib/demo-store";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: "Akses tidak diizinkan. Silakan login." }, { status: 401 });
  }

  const { sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId diperlukan" }, { status: 400 });
  }

  try {
    let msgList: any[] = [];
    let sessionData: any = null;
    let participantData: any = null;

    try {
      msgList = await db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(asc(messages.createdAt));

      const [dbSess] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId));
      sessionData = dbSess || null;

      if (sessionData?.participantCode) {
        const [dbPart] = await db
          .select()
          .from(participants)
          .where(eq(participants.participantCode, sessionData.participantCode));
        participantData = dbPart || null;
      }
    } catch {
      msgList = demoMessages.get(sessionId) || [];
      sessionData = demoSessions.get(sessionId) || null;
      if (sessionData?.participantCode) {
        participantData = Array.from(demoParticipants.values()).find(
          (p) => p.participantCode === sessionData.participantCode
        ) || null;
      }
    }

    return NextResponse.json({
      success: true,
      sessionId,
      session: sessionData,
      participant: participantData,
      messages: msgList,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
