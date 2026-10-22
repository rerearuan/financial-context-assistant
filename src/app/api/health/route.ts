import { NextResponse } from "next/server";
import { pool } from "@/db";
import { verifyModelAvailability, getGeminiModel } from "@/lib/gemini";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  try {
    const res = await pool.query("SELECT 1 as val");
    dbOk = res.rows.length > 0;
  } catch (e) {
    dbOk = false;
  }

  const geminiCheck = await verifyModelAvailability();

  return NextResponse.json({
    status: dbOk && geminiCheck.available ? "healthy" : "degraded",
    database: dbOk ? "connected" : "error",
    gemini: {
      model: getGeminiModel(),
      available: geminiCheck.available,
      error: geminiCheck.error || null,
    },
    timestamp: new Date().toISOString(),
  });
}
