import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { db } from "../src/db/index";
import { participants, sessions, messages } from "../src/db/schema";
import { desc, asc } from "drizzle-orm";
import fs from "fs";
import path from "path";

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

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) {
    return val.toISOString();
  }
  let str: string;
  if (typeof val === "object") {
    str = JSON.stringify(val);
  } else {
    str = String(val);
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportDatabaseToCsv(outDir = process.cwd()) {
  console.log("Mengekspor seluruh tabel database ke file CSV...");

  // 1. PARTICIPANTS (Raw)
  const partRows = await db.select().from(participants).orderBy(desc(participants.createdAt));
  if (partRows.length > 0) {
    const headers = Object.keys(partRows[0]);
    const csvLines = [headers.join(",")];
    for (const row of partRows) {
      csvLines.push(headers.map((h) => escapeCsv((row as any)[h])).join(","));
    }
    const filePath = path.join(outDir, "participants_export.csv");
    fs.writeFileSync(filePath, csvLines.join("\n"), "utf-8");
    console.log(`✓ [participants_export.csv] tersimpan (${partRows.length} baris)`);
  }

  // 2. SESSIONS (Raw)
  const sessRows = await db.select().from(sessions).orderBy(desc(sessions.createdAt));
  if (sessRows.length > 0) {
    const headers = Object.keys(sessRows[0]);
    const csvLines = [headers.join(",")];
    for (const row of sessRows) {
      csvLines.push(headers.map((h) => escapeCsv((row as any)[h])).join(","));
    }
    const filePath = path.join(outDir, "sessions_export.csv");
    fs.writeFileSync(filePath, csvLines.join("\n"), "utf-8");
    console.log(`✓ [sessions_export.csv] tersimpan (${sessRows.length} baris)`);
  }

  // 3. MESSAGES (Raw Chat Log)
  const msgRows = await db.select().from(messages).orderBy(asc(messages.createdAt));
  if (msgRows.length > 0) {
    const headers = Object.keys(msgRows[0]);
    const csvLines = [headers.join(",")];
    for (const row of msgRows) {
      csvLines.push(headers.map((h) => escapeCsv((row as any)[h])).join(","));
    }
    const filePath = path.join(outDir, "messages_export.csv");
    fs.writeFileSync(filePath, csvLines.join("\n"), "utf-8");
    console.log(`✓ [messages_export.csv] tersimpan (${msgRows.length} baris)`);
  }

  // 4. RESEARCH PARTICIPANTS TIDY (Format Analisis Skripsi / SPSS / R / Python / Excel)
  const tidyRows = partRows.map((p) => {
    const demo = (p.demographics as any) || {};
    const finalDec = (p.finalDecision as any) || {};
    const earlyDec = (p.earlyDecision as any) || {};
    const postQ = (p.postQuestionnaire as any) || {};

    const startTime = p.createdAt ? new Date(p.createdAt).getTime() : 0;
    const endTime = p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
    let durationSec = "";
    if (startTime > 0 && endTime > 0 && endTime >= startTime) {
      durationSec = Math.round((endTime - startTime) / 1000).toString();
    }

    const record: Record<string, unknown> = {
      participant_id: p.id,
      participant_code: p.participantCode,
      tanggal_pengerjaan: formatDateWIB(p.createdAt),
      waktu_mulai_wib: formatDateTimeWIB(p.createdAt),
      waktu_selesai_wib: p.isCompleted ? formatDateTimeWIB(p.updatedAt) : "",
      durasi_detik: durationSec,
      cell_number: p.cellNumber,
      scenario_id: p.scenarioId,
      condition: p.condition,
      current_step: p.currentStep,
      is_completed: p.isCompleted,
      disqualified: p.disqualified,
      created_at_utc: p.createdAt ? new Date(p.createdAt).toISOString() : "",
      updated_at_utc: p.updatedAt ? new Date(p.updatedAt).toISOString() : "",
      // Demografi
      age: demo.age || "",
      gender: demo.gender || "",
      domicile: demo.domicile || "",
      monthly_income: demo.monthlyIncome || "",
      education: demo.education || "",
      occupation: demo.occupation || "",
      chatbot_experience: demo.chatbotExperience || "",
      financial_knowledge: demo.financialKnowledge || "",
      contact: demo.contact || "",
      // Keputusan Awal & Akhir
      early_decision: earlyDec.decision || (earlyDec.q1 ? (earlyDec.q2 ? `${earlyDec.q1} (${earlyDec.q2})` : earlyDec.q1) : ""),
      early_justification: earlyDec.justification || earlyDec.q3 || "",
      final_decision: finalDec.decision || (finalDec.q1 ? (finalDec.q2 ? `${finalDec.q1} (${finalDec.q2})` : finalDec.q1) : ""),
      final_justification: finalDec.justification || finalDec.q3 || "",
    };

    // Tambahkan 20 item kuesioner sebagai kolom terpisah (AT1..AT4, MAC1..MAC4, OCC1..OCC4, PFDA1..PFDA4, RMAS1..RMAS4)
    for (const [key, val] of Object.entries(postQ)) {
      record[key] = val;
    }

    return record;
  });

  if (tidyRows.length > 0) {
    const allKeys = Array.from(new Set(tidyRows.flatMap((r) => Object.keys(r))));
    const csvLines = [allKeys.join(",")];
    for (const row of tidyRows) {
      csvLines.push(allKeys.map((k) => escapeCsv(row[k])).join(","));
    }
    const filePath = path.join(outDir, "research_participants_tidy.csv");
    fs.writeFileSync(filePath, csvLines.join("\n"), "utf-8");
    console.log(`✓ [research_participants_tidy.csv] (Analisis SPSS/Excel) tersimpan (${tidyRows.length} baris)`);
  }

  console.log("\nEkspor CSV berhasil diselesaikan!");
}

exportDatabaseToCsv()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Gagal mengekspor CSV:", err);
    process.exit(1);
  });
