import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, simulatedTransactions, messages, syntheticProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { buildStructuredContextPacket } from "@/lib/financial-engine/context-packager";
import { FinancialProfileContext } from "@/lib/financial-engine/types";
import { sanitizeAmount } from "@/lib/financial-engine/validator";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await req.json();
    const { decision, newAmount, notes } = body;

    if (!decision || !["proceed", "modify", "postpone", "cancel"].includes(decision)) {
      return NextResponse.json(
        { error: "Keputusan harus bernilai 'proceed', 'modify', 'postpone', atau 'cancel'." },
        { status: 400 }
      );
    }

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

    let updatedAction = { ...session.currentAction };

    if (decision === "modify") {
      const sanitized = sanitizeAmount(newAmount);
      if (sanitized && sanitized > 0) {
        updatedAction.amount = sanitized;
        updatedAction.modifiedByUser = true;
      }

      await db
        .update(sessions)
        .set({
          currentAction: updatedAction,
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, sessionId));

      // Append assistant note about the modification
      const modMsgId = `msg_mod_${crypto.randomBytes(8).toString("hex")}`;
      const modNote = `Nominal tindakan telah disesuaikan menjadi Rp ${updatedAction.amount.toLocaleString("id-ID")}. Perhitungan dan evaluasi diperbarui.`;

      await db.insert(messages).values({
        id: modMsgId,
        sessionId,
        role: "assistant",
        content: modNote,
        sourcesUsed: ["user_message"],
      });

      return NextResponse.json({
        success: true,
        status: session.status,
        updatedAction,
        message: modNote,
      });
    }

    // For "proceed", "postpone", or "cancel":
    // Prepare snapshot context
    let profileContext: FinancialProfileContext | null = null;
    if (session.condition === "context_aware") {
      const [profile] = await db
        .select()
        .from(syntheticProfiles)
        .where(eq(syntheticProfiles.scenarioId, session.scenarioId));

      if (profile) {
        profileContext = {
          totalCashBalance: profile.totalCashBalance,
          liquidBalance: profile.liquidBalance,
          budgets: profile.budgets,
          liabilities: profile.liabilities,
          goals: profile.goals,
          buffer: profile.buffer,
          incomeSchedule: profile.incomeSchedule,
          source: "synthetic_profile",
        };
      }
    }

    const contextPacket = buildStructuredContextPacket({
      condition: session.condition as "basic" | "context_aware",
      action: {
        type: updatedAction.type,
        amount: updatedAction.amount,
        timing: updatedAction.timing,
        targetCategory: updatedAction.targetCategory,
        description: updatedAction.description,
        source: updatedAction.modifiedByUser ? "user_message" : "scenario",
      },
      syntheticProfile: profileContext,
      userProvidedFinances: (updatedAction.userProvidedDetails as any) || null,
    });

    const transactionId = `tx_${crypto.randomBytes(12).toString("hex")}`;
    await db.insert(simulatedTransactions).values({
      id: transactionId,
      sessionId,
      actionType: updatedAction.type,
      amount: updatedAction.amount,
      decisionStatus: decision,
      userNotes: notes || null,
      snapshotData: {
        action: updatedAction,
        calculation: contextPacket.calculation,
        condition: session.condition,
        timestamp: new Date().toISOString(),
      },
    });

    // Update session status
    await db
      .update(sessions)
      .set({
        status: decision,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    // Append system/assistant confirmation message
    let finalExplanation = "";
    if (decision === "proceed") {
      finalExplanation = `[SIMULASI TRANSAKSI SELESAI] Anda telah memilih untuk LANJUT dengan ${
        updatedAction.type === "spending" ? "pengeluaran" : "penyisihan"
      } sebesar Rp ${updatedAction.amount.toLocaleString(
        "id-ID"
      )}. Transaksi ini telah dicatat sebagai simulasi penelitian (tidak ada dana riil yang dipindahkan). Terima kasih telah berpartisipasi.`;
    } else if (decision === "postpone") {
      finalExplanation = `[SIMULASI SELESAI] Anda telah memilih untuk MENUNDA tindakan sebesar Rp ${updatedAction.amount.toLocaleString(
        "id-ID"
      )}. Keputusan penundaan telah dicatat dalam simulasi.`;
    } else if (decision === "cancel") {
      finalExplanation = `[SIMULASI SELESAI] Anda telah memilih untuk MEMBATALKAN tindakan sebesar Rp ${updatedAction.amount.toLocaleString(
        "id-ID"
      )}. Keputusan pembatalan telah dicatat dalam simulasi.`;
    }

    const confirmMsgId = `msg_fin_${crypto.randomBytes(8).toString("hex")}`;
    await db.insert(messages).values({
      id: confirmMsgId,
      sessionId,
      role: "assistant",
      content: finalExplanation,
      sourcesUsed: ["scenario"],
    });

    return NextResponse.json({
      success: true,
      decisionStatus: decision,
      transactionId,
      finalMessage: finalExplanation,
      updatedAction,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
