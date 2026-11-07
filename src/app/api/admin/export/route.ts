import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/admin-auth";
import { db } from "@/db";
import { participants, sessions, messages } from "@/db/schema";
import { desc, asc } from "drizzle-orm";
import { demoParticipants, demoSessions, demoMessages } from "@/lib/demo-store";
import { EXPERIMENT_CELLS } from "@/lib/randomizer";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

function formatDateTimeWIB(d: Date | null | undefined): string {
  if (!d) return "";
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return "";
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
  if (!d) return "";
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return "";
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

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "xlsx"; // 'xlsx' | 'csv'

  try {
    let partList: any[] = [];
    let sessList: any[] = [];
    let msgList: any[] = [];

    try {
      partList = await db.select().from(participants).orderBy(desc(participants.createdAt));
      sessList = await db.select().from(sessions).orderBy(desc(sessions.createdAt));
      msgList = await db.select().from(messages).orderBy(asc(messages.createdAt));
    } catch {
      partList = Array.from(demoParticipants.values());
      sessList = Array.from(demoSessions.values());
      msgList = Array.from(demoMessages.values()).flat();
    }

    // 1. Tidy Research Participants sheet
    const tidyData = partList.map((p) => {
      const demo = (p.demographics as any) || {};
      const earlyDec = (p.earlyDecision as any) || {};
      const finalDec = (p.finalDecision as any) || {};
      const postQ = (p.postQuestionnaire as any) || {};

      const startTime = p.createdAt ? new Date(p.createdAt).getTime() : 0;
      const endTime = p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
      let durationSec = "";
      if (startTime > 0 && endTime > 0 && endTime >= startTime) {
        durationSec = Math.round((endTime - startTime) / 1000).toString();
      }

      const row: Record<string, any> = {
        "ID Partisipan": p.id,
        "Kode Partisipan": p.participantCode,
        "Tanggal (WIB)": formatDateWIB(p.createdAt),
        "Waktu Mulai (WIB)": formatDateTimeWIB(p.createdAt),
        "Waktu Selesai (WIB)": p.isCompleted ? formatDateTimeWIB(p.updatedAt) : "-",
        "Durasi (Detik)": durationSec,
        "Nomor Sel": p.cellNumber ?? "",
        "Skenario": p.scenarioId ?? "",
        "Kondisi": p.condition ?? "",
        "Tahap Terakhir (Step)": p.currentStep,
        "Status Selesai": p.isCompleted ? "YA" : "TIDAK",
        "Didiskualifikasi": p.disqualified ? "YA" : "TIDAK",
        "Alasan Diskualifikasi": p.disqualifiedReason || "-",
        // Demografi
        "Usia": demo.age || "",
        "Jenis Kelamin": demo.gender || "",
        "Domisili": demo.domicile || "",
        "Penghasilan Bulanan": demo.monthlyIncome || "",
        "Pendidikan Terakhir": demo.education || "",
        "Pekerjaan": demo.occupation || "",
        "Pengalaman Chatbot": demo.chatbotExperience || "",
        "Pengetahuan Finansial": demo.financialKnowledge || "",
        "Kontak Responden": demo.contact || "",
        // Keputusan
        "Keputusan Awal": earlyDec.decision || (earlyDec.q1 ? (earlyDec.q2 ? `${earlyDec.q1} (${earlyDec.q2})` : earlyDec.q1) : ""),
        "Alasan Keputusan Awal": earlyDec.justification || earlyDec.q3 || "",
        "Keputusan Akhir": finalDec.decision || (finalDec.q1 ? (finalDec.q2 ? `${finalDec.q1} (${finalDec.q2})` : finalDec.q1) : ""),
        "Alasan Keputusan Akhir": finalDec.justification || finalDec.q3 || "",
      };

      // 20 Item Kuesioner (AT1-4, MAC1-4, OCC1-4, PFDA1-4, RMAS1-4)
      for (const [k, v] of Object.entries(postQ)) {
        row[k] = v;
      }

      return row;
    });

    // 2. Cell Summary Sheet
    const cellSummaryData = EXPERIMENT_CELLS.map((cell) => {
      const cellParts = partList.filter((p) => p.cellNumber === cell.cellNumber);
      const cellCompleted = cellParts.filter((p) => p.isCompleted).length;
      return {
        "Nomor Sel": cell.cellNumber,
        "Skenario": cell.scenarioId,
        "Kondisi": cell.condition,
        "Target Responden": 25,
        "Responden Selesai": cellCompleted,
        "Total Masuk": cellParts.length,
        "Persentase Selesai (%)": Math.min(100, Math.round((cellCompleted / 25) * 100)),
      };
    });

    // 3. Chat Log Sheet
    const chatLogData = msgList.map((m) => {
      const parentSess = sessList.find((s) => s.id === m.sessionId);
      return {
        "Session ID": m.sessionId,
        "Kode Partisipan": parentSess?.participantCode || "-",
        "Waktu Pesan (WIB)": formatDateTimeWIB(m.createdAt),
        "Pengirim (Role)": m.role === "assistant" ? "Chatbot" : m.role === "user" ? "Responden" : m.role,
        "Isi Pesan": m.content,
        "Intent Terdeteksi": m.extractedIntent?.intentType || "-",
      };
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    if (format === "csv") {
      // Export as CSV with UTF-8 BOM
      const ws = XLSX.utils.json_to_sheet(tidyData);
      const csv = XLSX.utils.sheet_to_csv(ws);
      const bom = "\uFEFF";
      return new NextResponse(bom + csv, {
        headers: {
          "Content-Disposition": `attachment; filename="data-penelitian-${timestamp}.csv"`,
          "Content-Type": "text/csv; charset=utf-8",
        },
      });
    }

    // Default: Export as real Multi-sheet .xlsx
    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.json_to_sheet(tidyData);
    XLSX.utils.book_append_sheet(wb, ws1, "Partisipan Riset");

    const ws2 = XLSX.utils.json_to_sheet(cellSummaryData);
    XLSX.utils.book_append_sheet(wb, ws2, "Distribusi Sel");

    const ws3 = XLSX.utils.json_to_sheet(chatLogData);
    XLSX.utils.book_append_sheet(wb, ws3, "Transkrip Chatbot");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      headers: {
        "Content-Disposition": `attachment; filename="data-penelitian-skripsi-${timestamp}.xlsx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Export error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
