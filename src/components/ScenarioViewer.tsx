"use client";

import React, { useState } from "react";
import { Table, FileText } from "lucide-react";

export interface ScenarioData {
  id?: string;
  code?: string;
  title?: string;
  actionType?: string;
  conflictLevel?: string;
  situasiText?: string;
  kondisiKeuanganText?: string;
  tugasText?: string;
  descriptionText?: string;
}

interface ScenarioViewerProps {
  scenario: ScenarioData;
  compact?: boolean;
}

interface TableRowItem {
  label: string;
  value: string;
  isSectionHeader?: boolean;
  isSubItem?: boolean;
}

export function ScenarioViewer({ scenario, compact = false }: ScenarioViewerProps) {
  const [viewMode, setViewMode] = useState<"table" | "text">("table");

  const id = scenario.id || "";
  const isSpendingLow = id === "spending_low";
  const isSpendingHigh = id === "spending_high";
  const isSavingLow = id === "saving_low";
  const isSavingHigh = id === "saving_high";

  // Data baris tabel untuk masing-masing skenario (kata-kata 100% persis seperti di PDF instrumen)
  const getTableRows = (): TableRowItem[] => {
    if (isSpendingLow) {
      return [
        { label: "Pendapatan bulanan", value: "Rp8.000.000." },
        { label: "Pendapatan berikutnya diperkirakan diterima", value: "dalam 12 hari." },
        { label: "Saldo rekening Anda saat ini", value: "Rp18.000.000." },
        { label: "Dari saldo tersebut:", value: "", isSectionHeader: true },
        {
          label: "Dana Darurat yang ingin Anda pertahankan",
          value: "Rp5.000.000",
          isSubItem: true,
        },
        {
          label: "Dana yang selama beberapa bulan terakhir Anda sisihkan untuk pembelian laptop",
          value: "Rp6.000.000",
          isSubItem: true,
        },
        {
          label: "Dana yang digunakan untuk kebutuhan bulan berjalan",
          value: "Sisanya",
          isSubItem: true,
        },
        {
          label: "Pengeluaran rutin untuk kebutuhan sehari-hari selama bulan berjalan (berdasarkan riwayat transaksi)",
          value: "Mencapai sekitar Rp2.400.000",
        },
        {
          label: "Pengeluaran rutin untuk kebutuhan sehari-hari dalam tiga bulan terakhir (di luar tagihan khusus)",
          value: "Rp3.800.000–Rp4.600.000 per bulan",
        },
        {
          label: "Tagihan yang harus dibayar dalam 6 hari ke depan",
          value: "Rp1.800.000",
        },
        {
          label: "Pembayaran besar lain yang telah diketahui hingga pendapatan berikutnya diterima",
          value: "Tidak terdapat",
        },
      ];
    }

    if (isSpendingHigh) {
      return [
        { label: "Pendapatan bulanan", value: "Rp8.000.000." },
        { label: "Pendapatan berikutnya diperkirakan diterima", value: "dalam 12 hari." },
        { label: "Saldo rekening Anda saat ini", value: "Rp18.000.000." },
        { label: "Dari saldo tersebut:", value: "", isSectionHeader: true },
        {
          label: "Dana Darurat yang ingin Anda pertahankan",
          value: "Rp5.000.000",
          isSubItem: true,
        },
        {
          label: "Dana yang selama beberapa bulan terakhir Anda sisihkan untuk pembelian laptop",
          value: "Rp3.000.000",
          isSubItem: true,
        },
        {
          label: "Dana yang Anda sisihkan untuk program sertifikasi profesional",
          value: "Rp3.000.000",
          isSubItem: true,
        },
        {
          label: "Saldo yang masih tersedia saat ini untuk kebutuhan bulan berjalan",
          value: "Sisanya",
          isSubItem: true,
        },
        {
          label: "Biaya program sertifikasi diperkirakan",
          value: "Rp4.000.000–Rp4.500.000.",
        },
        {
          label: "Rencana mengikuti program sertifikasi",
          value: "Sekitar 2–3 bulan lagi.",
        },
        {
          label: "Pengeluaran rutin untuk kebutuhan sehari-hari selama bulan berjalan (berdasarkan riwayat transaksi)",
          value: "Mencapai sekitar Rp2.400.000",
        },
        {
          label: "Pengeluaran rutin untuk kebutuhan sehari-hari dalam tiga bulan terakhir (di luar tagihan khusus)",
          value: "Rp3.800.000–Rp4.600.000 per bulan",
        },
        {
          label: "Tagihan yang harus dibayar dalam 6 hari ke depan",
          value: "Rp1.800.000",
        },
        {
          label: "Pembayaran besar lain yang telah diketahui hingga pendapatan berikutnya diterima",
          value: "Tidak terdapat",
        },
      ];
    }

    if (isSavingLow) {
      return [
        { label: "Pendapatan bulanan", value: "Rp8.000.000." },
        {
          label: "Status penerimaan pendapatan",
          value: "Baru diterima hari ini (berikutnya ~30 hari lagi)",
        },
        { label: "Saldo rekening Anda saat ini", value: "Rp16.000.000." },
        { label: "Dari saldo tersebut:", value: "", isSectionHeader: true },
        {
          label: "Dana darurat yang telah Anda kumpulkan sebelumnya (dengan target Rp12.000.000)",
          value: "Rp8.000.000",
          isSubItem: true,
        },
        {
          label: "Pendapatan yang baru diterima dan tersedia untuk dialokasikan pada bulan berjalan",
          value: "Sisa Rp8.000.000",
          isSubItem: true,
        },
        {
          label: "Status pendapatan yang baru diterima",
          value: "Belum digunakan untuk memenuhi kebutuhan atau kewajiban",
        },
        {
          label: "Pengeluaran rutin untuk kebutuhan sehari-hari dalam tiga bulan terakhir (di luar biaya tempat tinggal, tagihan kartu/BNPL, dan utilitas)",
          value: "Rp2.400.000–Rp3.000.000 per bulan",
        },
        {
          label: "Biaya tempat tinggal yang harus dibayar dalam 9 hari",
          value: "Rp2.400.000",
        },
        {
          label: "Tagihan kartu/BNPL yang harus dibayar dalam 6 hari",
          value: "Rp600.000",
        },
        {
          label: "Tagihan utilitas bulan ini diperkirakan",
          value: "Rp400.000–Rp600.000",
        },
        {
          label: "Pembayaran besar lain yang telah diketahui pada bulan ini",
          value: "Tidak terdapat",
        },
        {
          label: "Sumber pendapatan tambahan yang telah dipastikan sebelum pendapatan berikutnya diterima",
          value: "Tidak terdapat",
        },
      ];
    }

    if (isSavingHigh) {
      return [
        { label: "Pendapatan bulanan", value: "Rp8.000.000." },
        {
          label: "Status penerimaan pendapatan",
          value: "Baru diterima hari ini (berikutnya ~30 hari lagi)",
        },
        { label: "Saldo rekening Anda saat ini", value: "Rp18.000.000." },
        { label: "Dari saldo tersebut:", value: "", isSectionHeader: true },
        {
          label: "Dana darurat yang telah dikumpulkan sebelumnya (dengan target Rp12.000.000)",
          value: "Rp8.000.000",
          isSubItem: true,
        },
        {
          label: "Dana yang telah disisihkan untuk mengikuti program sertifikasi profesional",
          value: "Rp2.000.000",
          isSubItem: true,
        },
        {
          label: "Pendapatan yang baru diterima dan tersedia untuk dialokasikan pada bulan berjalan",
          value: "Sisa Rp8.000.000",
          isSubItem: true,
        },
        {
          label: "Biaya program sertifikasi diperkirakan",
          value: "Rp4.000.000–Rp4.500.000.",
        },
        {
          label: "Rencana mengikuti program sertifikasi",
          value: "Sekitar 2–3 bulan lagi.",
        },
        {
          label: "Status pendapatan yang baru diterima",
          value: "Belum digunakan untuk memenuhi kebutuhan atau kewajiban",
        },
        {
          label: "Pengeluaran rutin untuk kebutuhan sehari-hari dalam tiga bulan terakhir (di luar biaya tempat tinggal, tagihan kartu/BNPL, dan utilitas)",
          value: "Rp2.400.000–Rp3.000.000 per bulan",
        },
        {
          label: "Biaya tempat tinggal yang harus dibayar dalam 9 hari",
          value: "Rp2.400.000",
        },
        {
          label: "Tagihan kartu/BNPL yang harus dibayar dalam 6 hari",
          value: "Rp600.000",
        },
        {
          label: "Tagihan utilitas bulan ini diperkirakan",
          value: "Rp400.000–Rp600.000",
        },
        {
          label: "Pembayaran besar lain yang telah diketahui pada bulan ini",
          value: "Tidak terdapat",
        },
        {
          label: "Sumber pendapatan tambahan yang telah dipastikan sebelum pendapatan berikutnya diterima",
          value: "Tidak terdapat",
        },
      ];
    }

    // Fallback: parse bullet lines generically
    const rawLines = (scenario.kondisiKeuanganText || "").split("\n");
    const parsed: TableRowItem[] = [];
    for (const raw of rawLines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.includes(":") && !line.endsWith(":")) {
        const parts = line.replace(/^[●○•\-\*]\s*/, "").split(":");
        parsed.push({
          label: parts[0].trim(),
          value: parts.slice(1).join(":").trim(),
          isSubItem: raw.startsWith("  ○") || raw.startsWith("    "),
        });
      } else {
        parsed.push({
          label: line.replace(/^[●○•\-\*]\s*/, ""),
          value: "",
          isSectionHeader: line.endsWith(":"),
          isSubItem: raw.startsWith("  ○") || raw.startsWith("    "),
        });
      }
    }
    return parsed;
  };

  const tableRows = getTableRows();

  return (
    <div className={`space-y-4 ${compact ? "text-xs" : "text-xs sm:text-sm"}`}>
      {/* -------------------------------------------------------------
          BAGIAN SITUASI (Teks Narasi Asli Sesuai PDF)
      ------------------------------------------------------------- */}
      <div className="bg-white rounded-xl border border-slate-300 p-4 sm:p-5 shadow-2xs">
        <h4 className="font-bold text-slate-900 text-sm mb-2.5 pb-1.5 border-b border-slate-200">
          Situasi
        </h4>
        <div className="whitespace-pre-line text-slate-800 leading-relaxed font-normal">
          {scenario.situasiText || scenario.descriptionText}
        </div>
      </div>

      {/* -------------------------------------------------------------
          BAGIAN KONDISI KEUANGAN ANDA
      ------------------------------------------------------------- */}
      <div className="bg-white rounded-xl border border-slate-300 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-3 border-b border-slate-200">
          <h4 className="font-bold text-slate-900 text-sm">
            Kondisi Keuangan Anda
          </h4>

          {/* Toggle View: Tabel vs Teks Asli PDF */}
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                viewMode === "table"
                  ? "bg-white text-slate-900 shadow-2xs font-semibold"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Format Tabel</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("text")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                viewMode === "text"
                  ? "bg-white text-slate-900 shadow-2xs font-semibold"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Format Teks Asli (PDF)</span>
            </button>
          </div>
        </div>

        {viewMode === "table" ? (
          /* TABEL: Kiri Semua Tulisan, Kanan Angka (Sesuai Arahan Alfian) */
          <div className="overflow-x-auto rounded-lg border border-slate-300">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-300 text-slate-800 text-[11px] sm:text-xs font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Keterangan</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap w-40 sm:w-48">
                    Jumlah / Waktu
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs sm:text-sm text-slate-800">
                {tableRows.map((row, idx) => {
                  if (row.isSectionHeader) {
                    return (
                      <tr
                        key={idx}
                        className="bg-slate-50 font-semibold text-slate-900"
                      >
                        <td
                          colSpan={2}
                          className="py-2 px-3 text-xs tracking-wide"
                        >
                          ● {row.label}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={idx}
                      className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}
                    >
                      <td
                        className={`py-2 px-3 align-top leading-snug ${
                          row.isSubItem
                            ? "pl-6 sm:pl-7 text-slate-700"
                            : "text-slate-900 font-normal"
                        }`}
                      >
                        <span className="text-slate-400 mr-1.5">
                          {row.isSubItem ? "○" : "●"}
                        </span>
                        {row.label}
                      </td>
                      <td className="py-2 px-3 align-top text-right font-semibold text-slate-900 whitespace-nowrap">
                        {row.value}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* TEKS ASLI: Daftar Poin-Poin Persis Seperti di PDF */
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-line font-normal">
            {scenario.kondisiKeuanganText}
          </div>
        )}
      </div>
    </div>
  );
}
