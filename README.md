# Context-Aware Conversational Financial Assistant (Prototipe Penelitian)

Prototipe web chatbot berbasis **Next.js (App Router)**, **TypeScript**, **PostgreSQL (Drizzle ORM)**, dan **Gemini API (`@google/genai`)** untuk penelitian keputusan keuangan simulasi (*spending* dan *saving*).

> **Pernyataan Simulasi:** Seluruh saldo, transaksi, profil, dan skenario adalah simulasi penelitian. Tidak ada uang riil atau koneksi ke rekening perbankan nyata.

---

## 1. Konsep & Dua Konfigurasi Asisten

Penelitian ini membandingkan dua konfigurasi asisten percakapan finansial menggunakan model LLM yang sama (`gemini-3.5-flash-lite`), instruksi dasar yang sama, dan aturan perhitungan matematis deterministik yang identik:

1. **Basic-Information Assistant (`basic`):**
   - **Tidak menerima** profil keuangan sintetis saat inisialisasi sesi.
   - Tetap ramah, objektif, dan mampu menjawab pertanyaan finansial umum serta mengevaluasi tindakan berdasarkan prinsip umum.
   - Jika pengguna meminta perhitungan numerik saldo/anggaran tetapi belum membagikan datanya, asisten menyatakan secara jujur bahwa data saldo belum tersedia dan mengundang pengguna membagikannya.
   - **Dapat menggunakan informasi finansial** jika pengguna mengetikkannya sendiri di dalam percakapan (dicatat dengan sumber `user_message`).
   - Backend **tidak pernah** memasukkan profil sintetis ke prompt, chat history, system instruction, atau ringkasan tersembunyi pada kondisi ini.

2. **Context-Aware Assistant (`context_aware`):**
   - Menerima profil sintetis terstruktur yang sesuai dengan skenario sejak awal.
   - Mengaitkan rencana tindakan pengguna secara menyeluruh dengan: saldo kas operasional, sisa anggaran pos terkait, kewajiban mendesak sebelum pemasukan berikutnya, dan perlindungan buffer darurat/tujuan tabungan.

---

## 2. Arsitektur Pemrosesan Konteks & AI Engineering

Arsitektur sistem memisahkan secara tegas 3 komponen:
1. **Ekstraksi Maksud (*Intent Extraction*):**
   - Mengekstrak maksud pengguna, perubahan nominal tindakan, atau data keuangan yang dibagikan pengguna ke dalam format JSON terstruktur yang divalidasi dengan **Zod** (`ExtractedIntentSchema`).
2. **Kalkulator Finansial Deterministik (*Deterministic Financial Calculator*):**
   - Dilakukan di kode TypeScript murni (`src/lib/financial-engine/calculator.ts`), **bukan diserahkan kepada LLM untuk berhitung atau mengarang angka**.
   - Menghitung sisa saldo kas setelah tindakan, selisih anggaran pos terkait, kewajiban yang jatuh tempo **sebelum** pemasukan berikutnya (pemasukan setelah tanggal kewajiban tidak dihitung), sisa dana likuid, serta potensi ancaman likuiditas/defisit.
   - Menjaga batasan klaim: membedakan "melebihi anggaran perangkat" dari "pasti menggunakan dana sertifikasi".
3. **Penyusunan Respons (*Grounded Generation* via Gemini):**
   - Menggunakan SDK resmi `@google/genai`.
   - Menggunakan fakta perhitungan matematis terverifikasi (`deterministicFacts`) sebagai sumber kebenaran (*ground truth*).
   - Dilengkapi **mekanisme fallback deterministik yang aman**: jika terjadi timeout atau kegagalan API, chatbot tetap menampilkan respons berbasis hasil perhitungan yang valid tanpa pernah membocorkan data sesi lain.

---

## 3. Empat Paket Skenario Sintetis

| No | Kode | Judul Skenario | Tipe | Horizon Kewajiban & Dampak |
|---|---|---|---|---|
| 1 | `spending_low` | Rencana Pembelian Ponsel Kerja (Rp 3.500.000) | Spending | Anggaran perangkat mencukupi (surplus Rp 500.000). Kewajiban sebelum gaji hanya Rp 450.000. Likuiditas aman. |
| 2 | `spending_high` | Rencana Pembelian Ponsel Kerja (Rp 3.500.000) | Spending | Melebihi anggaran pos perangkat sebesar Rp 2.500.000. Ada kewajiban Rp 3.100.000 sebelum gaji. Terjadi defisit likuiditas Rp 1.400.000. |
| 3 | `saving_low` | Rencana Penempatan Tabungan Fleksibel (Rp 2.000.000) | Saving | Sesuai alokasi tabungan (surplus Rp 500.000). Kewajiban terdekat Rp 600.000 tertutup kas. Likuiditas aman. |
| 4 | `saving_high` | Rencana Penempatan Deposito Terkunci (Rp 2.000.000) | Saving | Melebihi alokasi Rp 1.200.000. Mengunci kas 12 bulan padahal ada kewajiban Rp 2.500.000 sebelum gaji. Terjadi defisit likuiditas Rp 1.300.000. |

*Catatan: Label "low/high conflict" adalah klasifikasi internal penelitian dan tidak ditampilkan kepada responden.*

---

## 4. Struktur Direktori Proyek

```
SKRIPSI/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── health/route.ts                # Healthcheck DB & verifikasi model Gemini
│   │   │   ├── sessions/route.ts              # Inisialisasi sesi partisipan baru
│   │   │   ├── sessions/[sessionId]/route.ts  # Detail sesi & riwayat pesan
│   │   │   ├── sessions/[sessionId]/chat/route.ts   # Chat handler (Intent -> Calc -> Gemini)
│   │   │   ├── sessions/[sessionId]/action/route.ts # Aksi: Lanjut, Ubah, Tunda, Batal
│   │   │   └── dev/fixtures/route.ts          # Fixtures & data inspeksi dev preview
│   │   ├── chat/[sessionId]/page.tsx          # Antarmuka Chat Responden (Desktop & Mobile)
│   │   ├── dev-preview/page.tsx               # Matriks Preview 8 Kombinasi (Khusus Peneliti)
│   │   ├── page.tsx                           # Landing Page Partisipan (Input Kode Sesi)
│   │   ├── layout.tsx & globals.css
│   ├── db/
│   │   ├── schema.ts                          # Drizzle ORM Schema (scenarios, profiles, sessions, messages, tx)
│   │   ├── index.ts                           # Database connection pool (PostgreSQL)
│   │   ├── migrate.ts                         # Skrip migrasi DDL otomatis
│   │   └── seed.ts                            # Skrip seeding skenario, profil, & 8 sesi fixture dev
│   ├── fixtures/
│   │   └── scenarios.ts                       # 4 paket skenario sintetis & expected ground truth
│   ├── lib/
│   │   ├── gemini.ts                          # SDK @google/genai, fallback, verifikasi model
│   │   ├── prompts/
│   │   │   ├── templates.ts                   # System instruction, template prompt Basic & Context-Aware
│   │   │   └── intent-schema.ts               # Skema Zod untuk ekstraksi maksud
│   │   └── financial-engine/
│   │       ├── types.ts                       # Type definitions
│   │       ├── validator.ts                   # Validasi nominal, waktu, kelengkapan
│   │       ├── relevant-selector.ts           # Pemilihan pos relevan & horizon waktu
│   │       ├── calculator.ts                  # Kalkulator deterministik konsekuensi keuangan
│   │       └── context-packager.ts            # Penyusun paket konteks (isolasi ketat profil)
├── tests/
│   ├── financial-engine.test.ts               # Pengujian ground truth 4 skenario & no double-counting
│   ├── context-packager.test.ts               # Pengujian isolasi kondisi Basic vs Context-Aware
│   └── session-isolation.test.ts              # Pengujian isolasi sesi, fallback aman, & transaksi simulasi
├── .env.example
├── .env.local
├── drizzle.config.ts
├── vitest.config.ts
├── package.json
└── README.md
```

---

## 5. Prasyarat & Menjalankan Secara Lokal

### A. Environment Variables
Buat file `.env.local` (atau salin dari `.env.example`):
```bash
cp .env.example .env.local
```
Isi variabel berikut:
```env
# PostgreSQL connection string
DATABASE_URL=postgresql://localhost:5432/skripsi_chat

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite

# Pengaturan Aplikasi
NODE_ENV=development
MAX_FOLLOWUP_QUESTIONS=2
```

### B. Setup Database & Jalankan Aplikasi
1. **Jalankan migrasi database:**
   ```bash
   npm run db:migrate
   ```
2. **Jalankan seeding skenario & fixtures:**
   ```bash
   npm run db:seed
   ```
3. **Jalankan server pengembangan:**
   ```bash
   npm run dev
   ```
   Aplikasi dapat diakses di `http://localhost:3000`.

---

## 6. Cara Mengakses Matriks 8 Kombinasi (Preview Peneliti)

Buka tautan berikut di browser:
👉 **`http://localhost:3000/dev-preview`**

Pada halaman ini peneliti dapat:
1. Memilih salah satu dari 4 skenario (*Spending Low, Spending High, Saving Low, Saving High*).
2. Membuka sesi uji coba untuk **Basic-Information Assistant** maupun **Context-Aware Assistant**.
3. Meninjau data inspeksi *Expected Ground Truth* (sisa saldo, variansi anggaran, kewajiban sebelum gaji, status ancaman likuiditas, dan nilai defisit).
4. Membuat sesi baru (*+ Sesi Baru*) untuk eksperimen tambahan.

---

## 7. Cara Verifikasi Model Gemini

Untuk memeriksa daftar model yang didukung oleh API key Anda tanpa menebak nama model:
```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" | grep '"name":'
```
Model yang telah terkonfigurasi dan terverifikasi untuk penelitian ini adalah:
- `gemini-3.5-flash-lite` (Default)
- Model dapat diganti sewaktu-waktu melalui variabel environment `GEMINI_MODEL`.
- Status kesiapan model dapat dipantau langsung melalui endpoint `GET /api/health`.

---

## 8. Menjalankan Pengujian Otomatis

Seluruh pengujian dirancang untuk memvalidasi persyaratan metodologi penelitian:
```bash
# Jalankan unit & integration tests
npm run test

# Jalankan linter
npm run lint

# Jalankan typecheck TypeScript
npm run typecheck

# Jalankan build produksi
npm run build
```

---

## 9. Penanganan Keputusan Akhir ("Lanjut")

Sesuai batasan penelitian, tombol **"Lanjut"** hanya mencatat keputusan partisipan ke tabel `simulated_transactions` dengan status `proceed`, mengunci status sesi menjadi selesai, dan menampilkan konfirmasi bahwa tindakan adalah **transaksi simulasi**. Tidak ada integrasi ke sistem pembayaran nyata.

---

## 10. Hal yang Menunggu Keputusan Protokol Penelitian (Tahap Selanjutnya)

Komponen berikut telah disiapkan fondasi datanya namun sengaja belum diaktifkan sesuai batasan tahap pertama:
1. **Halaman Informed Consent Responden:** Dapat ditempatkan sebelum responden diarahkan ke kode sesi.
2. **Kuesioner Pre-Test & Post-Test:** Mengukur literasi finansial, persepsi risiko, atau keputusan akhir.
3. **Random Assignment Generator:** Logika pengacakan partisipan ke salah satu dari 8 sel eksperimen di level platform riset luar/kuesioner.
4. **Dashboard Rekapitulasi Peneliti:** Ekspor CSV/Excel log percakapan, jumlah pertanyaan yang diajukan, dan keputusan akhir partisipan untuk analisis statistik (ANOVA / Regresi).
