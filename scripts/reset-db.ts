import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { db } from "../src/db/index";
import { participants, sessions, messages, simulatedTransactions, scenarios, syntheticProfiles } from "../src/db/schema";
import { runSeed } from "../src/db/seed";
import { count } from "drizzle-orm";

async function resetDatabase() {
  console.log("==================================================");
  console.log("MENGOSONGKAN DATA RIWAYAT UNTUK PENGAMBILAN DATA BARU");
  console.log("==================================================");

  try {
    // 1. Hapus data transaksi simulasi
    await db.delete(simulatedTransactions);
    console.log("✓ Tabel simulated_transactions berhasil dikosongkan.");

    // 2. Hapus seluruh pesan percakapan
    await db.delete(messages);
    console.log("✓ Tabel messages berhasil dikosongkan.");

    // 3. Hapus seluruh sesi percakapan
    await db.delete(sessions);
    console.log("✓ Tabel sessions berhasil dikosongkan.");

    // 4. Hapus seluruh data partisipan
    await db.delete(participants);
    console.log("✓ Tabel participants berhasil dikosongkan.");

    // 5. Seed ulang skenario dan profil sintetis terbaru
    console.log("\nMemperbarui data skenario dan profil instrumen riset...");
    await runSeed();

    // 6. Verifikasi jumlah data terkini
    const pCount = await db.select({ val: count() }).from(participants);
    const txCount = await db.select({ val: count() }).from(simulatedTransactions);
    const sCount = await db.select({ val: count() }).from(sessions);
    const mCount = await db.select({ val: count() }).from(messages);
    const scCount = await db.select({ val: count() }).from(scenarios);
    const profCount = await db.select({ val: count() }).from(syntheticProfiles);

    console.log("\n==================================================");
    console.log("HASIL STATUS DATABASE SETELAH RESET:");
    console.log("==================================================");
    console.log(`- Partisipan (participants)         : ${pCount[0].val} (BERSIH)`);
    console.log(`- Transaksi Simulasi (transactions) : ${txCount[0].val} (BERSIH)`);
    console.log(`- Sesi Dev/Preview (sessions)       : ${sCount[0].val} (8 Sesi Standar Dev)`);
    console.log(`- Pesan Awal (messages)             : ${mCount[0].val} (8 Pesan Pembuka Dev)`);
    console.log(`- Skenario Riset (scenarios)        : ${scCount[0].val} Skenario`);
    console.log(`- Profil Sintetis (profiles)        : ${profCount[0].val} Profil`);
    console.log("==================================================");
    console.log("Database siap digunakan untuk pengumpulan data penelitian nyata!");
  } catch (error) {
    console.error("Gagal melakukan reset database:", error);
    process.exit(1);
  }
}

resetDatabase().then(() => process.exit(0));
