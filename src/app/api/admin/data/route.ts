import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/admin-auth";
import { db } from "@/db";
import { participants, sessions, messages } from "@/db/schema";
import { desc } from "drizzle-orm";
import { demoParticipants, demoSessions, demoMessages } from "@/lib/demo-store";
import { EXPERIMENT_CELLS } from "@/lib/randomizer";

export const dynamic = "force-dynamic";

function formatDateTimeWIB(d: Date | null | undefined): string {
  if (!d) return "-";
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return "-";
  const tzDate = new Date(dateObj.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const yyyy = tzDate.getFullYear();
  const mm = String(tzDate.getMonth() + 1).padStart(2, "0");
  const dd = String(tzDate.getDate()).padStart(2, "0");
  const hh = String(tzDate.getHours()).padStart(2, "0");
  const min = String(tzDate.getMinutes()).padStart(2, "0");
  const ss = String(tzDate.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function formatDateWIB(d: Date | null | undefined): string {
  if (!d) return "-";
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return "-";
  const tzDate = new Date(dateObj.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const yyyy = tzDate.getFullYear();
  const mm = String(tzDate.getMonth() + 1).padStart(2, "0");
  const dd = String(tzDate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: "Akses tidak diizinkan. Silakan login." }, { status: 401 });
  }

  try {
    let partList: any[] = [];
    let sessList: any[] = [];
    let msgList: any[] = [];
    let isDbConnected = true;
    let dbHost = "unknown";
    let dbErrorMessage: string | null = null;

    try {
      if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost")) {
        if (process.env.VERCEL) {
          throw new Error("DATABASE_URL belum dikonfigurasi di environment variables Vercel.");
        }
      }

      if (process.env.DATABASE_URL) {
        try {
          dbHost = new URL(process.env.DATABASE_URL).host;
        } catch {
          dbHost = "configured";
        }
      }

      partList = await db.select().from(participants).orderBy(desc(participants.createdAt));
      sessList = await db.select().from(sessions).orderBy(desc(sessions.createdAt));
      msgList = await db.select().from(messages).orderBy(desc(messages.createdAt));
    } catch (dbErr: any) {
      isDbConnected = false;
      dbErrorMessage = dbErr?.message || "Koneksi database PostgreSQL tidak dapat diakses.";
      console.warn("DB not reachable in /api/admin/data, using in-memory demo store:", dbErr);
      partList = Array.from(demoParticipants.values());
      sessList = Array.from(demoSessions.values());
      msgList = Array.from(demoMessages.values()).flat();
    }

    // Map messages count by sessionId
    const msgCountMap = new Map<string, number>();
    const msgHistoryMap = new Map<string, any[]>();
    for (const m of msgList) {
      if (m.sessionId) {
        msgCountMap.set(m.sessionId, (msgCountMap.get(m.sessionId) || 0) + 1);
        const history = msgHistoryMap.get(m.sessionId) || [];
        history.push(m);
        msgHistoryMap.set(m.sessionId, history);
      }
    }

    // Process participant rows for UI
    const processedParticipants = partList.map((p) => {
      const demo = (p.demographics as any) || {};
      const earlyDec = (p.earlyDecision as any) || {};
      const finalDec = (p.finalDecision as any) || {};
      const postQ = (p.postQuestionnaire as any) || {};

      const startTime = p.createdAt ? new Date(p.createdAt).getTime() : 0;
      const endTime = p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
      let durationSec = 0;
      if (startTime > 0 && endTime > 0 && endTime >= startTime) {
        durationSec = Math.round((endTime - startTime) / 1000);
      }

      // Compute subscale averages if postQuestionnaire exists
      const calculateAvg = (prefix: string) => {
        const items = Object.entries(postQ)
          .filter(([k]) => k.startsWith(prefix))
          .map(([, v]) => Number(v))
          .filter((v) => !isNaN(v));
        if (items.length === 0) return null;
        return Number((items.reduce((a, b) => a + b, 0) / items.length).toFixed(2));
      };

      const scaleAverages = {
        AT: calculateAvg("AT"),
        MAC: calculateAvg("MAC"),
        OCC: calculateAvg("OCC"),
        PFDA: calculateAvg("PFDA"),
        RMAS: calculateAvg("RMAS"),
      };

      return {
        id: p.id,
        participantCode: p.participantCode,
        cellNumber: p.cellNumber,
        scenarioId: p.scenarioId,
        condition: p.condition,
        sessionId: p.sessionId,
        currentStep: p.currentStep,
        isCompleted: p.isCompleted,
        disqualified: p.disqualified,
        disqualifiedReason: p.disqualifiedReason || null,
        tanggal: formatDateWIB(p.createdAt),
        waktuMulai: formatDateTimeWIB(p.createdAt),
        waktuSelesai: p.isCompleted ? formatDateTimeWIB(p.updatedAt) : "-",
        durasiDetik: durationSec,
        messageCount: p.sessionId ? (msgCountMap.get(p.sessionId) || 0) : 0,
        chatHistory: p.sessionId
          ? (msgHistoryMap.get(p.sessionId) || [])
              .sort(
                (a, b) =>
                  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
              )
              .map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                createdAt: formatDateTimeWIB(m.createdAt),
              }))
          : [],
        demographics: {
          age: demo.age || "-",
          gender: demo.gender || "-",
          domicile: demo.domicile || "-",
          monthlyIncome: demo.monthlyIncome || "-",
          education: demo.education || "-",
          occupation: demo.occupation || "-",
          financialKnowledge: demo.financialKnowledge || "-",
          chatbotExperience: demo.chatbotExperience || "-",
          contact: demo.contact || "-",
        },
        earlyDecision: {
          decision: earlyDec.decision || (earlyDec.q1 ? (earlyDec.q2 ? `${earlyDec.q1} (${earlyDec.q2})` : earlyDec.q1) : "-"),
          justification: earlyDec.justification || earlyDec.q3 || "-",
          ...earlyDec,
        },
        finalDecision: {
          decision: finalDec.decision || (finalDec.q1 ? (finalDec.q2 ? `${finalDec.q1} (${finalDec.q2})` : finalDec.q1) : "-"),
          justification: finalDec.justification || finalDec.q3 || "-",
          answers: finalDec.answers || {},
          q1: finalDec.q1,
          q2: finalDec.q2,
          q3: finalDec.q3,
        },
        postQuestionnaire: postQ,
        scaleAverages,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    // Stats
    const totalParticipants = processedParticipants.length;
    const completedCount = processedParticipants.filter((p) => p.isCompleted).length;
    const inProgressCount = processedParticipants.filter((p) => !p.isCompleted && !p.disqualified).length;
    const disqualifiedCount = processedParticipants.filter((p) => p.disqualified).length;

    // Cell stats (1 to 8)
    const cellStats = EXPERIMENT_CELLS.map((cell) => {
      const cellParts = processedParticipants.filter((p) => p.cellNumber === cell.cellNumber);
      const cellCompleted = cellParts.filter((p) => p.isCompleted).length;
      return {
        cellNumber: cell.cellNumber,
        scenarioId: cell.scenarioId,
        condition: cell.condition,
        target: 25,
        total: cellParts.length,
        completed: cellCompleted,
        progressPct: Math.min(100, Math.round((cellCompleted / 25) * 100)),
      };
    });

    return NextResponse.json({
      success: true,
      dbStatus: {
        connected: isDbConnected,
        host: dbHost,
        error: dbErrorMessage,
      },
      stats: {
        totalParticipants,
        completedCount,
        inProgressCount,
        disqualifiedCount,
        totalSessions: sessList.length,
        totalMessages: msgList.length,
        cellStats,
      },
      participants: processedParticipants,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Admin data API error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
