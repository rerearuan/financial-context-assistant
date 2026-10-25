import { NextResponse } from "next/server";
import { runMigration } from "@/db/migrate";
import { runSeed } from "@/db/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "DATABASE_URL environment variable is not defined on server.",
        },
        { status: 400 }
      );
    }

    await runMigration();
    await runSeed();

    return NextResponse.json({
      success: true,
      message: "Database schema migrated and fixtures seeded successfully.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Migration/Seed error:", err);
    return NextResponse.json(
      {
        success: false,
        error: msg,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
