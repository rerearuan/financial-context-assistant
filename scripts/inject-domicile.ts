import { db } from "../src/db";
import { participants } from "../src/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Menjalankan inject domisili 'Jabodetabek (Jakarta, Bogor, Depok, Tangerang, Bekasi)'...");

  // Using Postgres JSONB concatenation: demographics || '{"domicile": "..."}'::jsonb
  const targetDomicile = "Jabodetabek (Jakarta, Bogor, Depok, Tangerang, Bekasi)";
  
  const result = await db.execute(sql`
    UPDATE participants
    SET demographics = COALESCE(demographics, '{}'::jsonb) || '{"domicile": "Jabodetabek (Jakarta, Bogor, Depok, Tangerang, Bekasi)"}'::jsonb
  `);

  console.log("Update query selesai.");

  // Fetch updated records to verify
  const rows = await db.select({
    id: participants.id,
    code: participants.participantCode,
    demographics: participants.demographics,
  }).from(participants);

  console.log(`Total partisipan terdaftar: ${rows.length}`);
  const sample = rows.slice(0, 5);
  for (const s of sample) {
    console.log(`- [${s.code}] domicile: ${s.demographics?.domicile}`);
  }

  const withDomicile = rows.filter((r) => r.demographics?.domicile === targetDomicile);
  console.log(`Partisipan dengan domisili terisi: ${withDomicile.length} / ${rows.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Gagal inject domisili:", err);
  process.exit(1);
});
