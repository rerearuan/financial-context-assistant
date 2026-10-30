"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Bot,
  Copy,
  Check,
  ExternalLink,
  Info,
  ArrowRight,
  ShieldCheck,
  Cpu,
} from "lucide-react";

interface CellItem {
  cellNumber: number;
  type: "Pengeluaran (Spending)" | "Tabungan (Saving)";
  conflict: "Low Conflict (Nominal Rendah)" | "High Conflict (Nominal Tinggi)";
  condition: "Basic" | "Context-Aware";
  scenarioTitle: string;
  nominalText: string;
  description: string;
}

const CELLS: CellItem[] = [
  {
    cellNumber: 1,
    type: "Pengeluaran (Spending)",
    conflict: "Low Conflict (Nominal Rendah)",
    condition: "Basic",
    scenarioTitle: "Pembelian Laptop Baru",
    nominalText: "Rp 7.000.000 (Tunai/Cicilan)",
    description: "Chatbot standar berbasis skenario tanpa akses ke profil keuangan riil/sintetis.",
  },
  {
    cellNumber: 2,
    type: "Pengeluaran (Spending)",
    conflict: "Low Conflict (Nominal Rendah)",
    condition: "Context-Aware",
    scenarioTitle: "Pembelian Laptop Baru",
    nominalText: "Rp 7.000.000 (Tunai/Cicilan)",
    description: "Chatbot cerdas dengan akses ke profil transaksi, saldo, tagihan mendatang, dan guardrail.",
  },
  {
    cellNumber: 3,
    type: "Pengeluaran (Spending)",
    conflict: "High Conflict (Nominal Tinggi)",
    condition: "Basic",
    scenarioTitle: "Pembelian Laptop Baru",
    nominalText: "Rp 7.000.000 (Tunai/Cicilan)",
    description: "Chatbot standar tanpa evaluasi likuiditas mendalam di situasi ketat.",
  },
  {
    cellNumber: 4,
    type: "Pengeluaran (Spending)",
    conflict: "High Conflict (Nominal Tinggi)",
    condition: "Context-Aware",
    scenarioTitle: "Pembelian Laptop Baru",
    nominalText: "Rp 7.000.000 (Tunai/Cicilan)",
    description: "Chatbot proaktif mendeteksi defisit arus kas dan ancaman likuiditas jika membeli tunai.",
  },
  {
    cellNumber: 5,
    type: "Tabungan (Saving)",
    conflict: "Low Conflict (Nominal Rendah)",
    condition: "Basic",
    scenarioTitle: "Alokasi Tambahan Dana Darurat",
    nominalText: "Rp 1.000.000 - Rp 3.000.000",
    description: "Chatbot standar mendiskusikan opsi menabung tanpa menghubungkan dengan pengeluaran rutin.",
  },
  {
    cellNumber: 6,
    type: "Tabungan (Saving)",
    conflict: "Low Conflict (Nominal Rendah)",
    condition: "Context-Aware",
    scenarioTitle: "Alokasi Tambahan Dana Darurat",
    nominalText: "Rp 1.000.000 - Rp 3.000.000",
    description: "Chatbot mengevaluasi kapasitas tabungan terhadap sisa saldo bebas dan target darurat.",
  },
  {
    cellNumber: 7,
    type: "Tabungan (Saving)",
    conflict: "High Conflict (Nominal Tinggi)",
    condition: "Basic",
    scenarioTitle: "Alokasi Tabungan & Biaya Sertifikasi",
    nominalText: "Rp 1.000.000 - Rp 3.000.000 vs Tagihan",
    description: "Chatbot standar membahas alokasi tabungan tanpa peringatan benturan tagihan/sertifikasi.",
  },
  {
    cellNumber: 8,
    type: "Tabungan (Saving)",
    conflict: "High Conflict (Nominal Tinggi)",
    condition: "Context-Aware",
    scenarioTitle: "Alokasi Tabungan & Biaya Sertifikasi",
    nominalText: "Rp 1.000.000 - Rp 3.000.000 vs Tagihan",
    description: "Chatbot proaktif memperingatkan benturan likuiditas antara target tabungan dan jatuh tempo sertifikasi.",
  },
];

export default function CellsDirectoryPage() {
  const [copiedCell, setCopiedCell] = useState<number | null>(null);

  const getFullUrl = (cellNum: number) => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/c/${cellNum}`;
    }
    return `https://financial-context-assistant.vercel.app/c/${cellNum}`;
  };

  const handleCopy = (cellNum: number) => {
    const url = getFullUrl(cellNum);
    navigator.clipboard.writeText(url);
    setCopiedCell(cellNum);
    setTimeout(() => {
      setCopiedCell(null);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold mb-3 border border-blue-200">
            <Cpu className="w-3.5 h-3.5" />
            <span>Master Link Chatbot • Uji Manipulasi &amp; Pengumpulan Data</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Daftar 8 Kombinasi Chatbot Asisten Finansial
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed max-w-3xl">
            Halaman ini memuat tautan langsung (<em>direct link</em>) ke masing-masing dari 8 kombinasi perlakuan eksperimen (desain faktorial 2x2x2).
            Responden yang mengklik tautan di bawah dapat <strong>langsung berinteraksi dengan chatbot tanpa perlu mengisi kuesioner awal</strong> di website.
          </p>

          <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-slate-800 mb-0.5">
                Petunjuk Pemasangan di Google Form:
              </span>
              <span>
                Tempelkan tautan masing-masing kombinasi (misal <code className="bg-white px-1.5 py-0.5 rounded border border-slate-300 font-mono text-blue-700">/c/1</code> pada Form Manip Check 1, <code className="bg-white px-1.5 py-0.5 rounded border border-slate-300 font-mono text-blue-700">/c/2</code> pada Form Manip Check 2, dst.). Setelah responden selesai chat, mereka akan diarahkan untuk kembali ke Google Form.
              </span>
            </div>
          </div>
        </div>

        {/* 8 Cells Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CELLS.map((cell) => {
            const isContextAware = cell.condition === "Context-Aware";
            return (
              <div
                key={cell.cellNumber}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                      Kombinasi #{cell.cellNumber}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                        isContextAware
                          ? "bg-purple-50 text-purple-700 border-purple-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {cell.condition}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 mt-1">
                    {cell.scenarioTitle}
                  </h3>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">
                    {cell.type} • {cell.conflict}
                  </div>
                  <div className="text-xs font-mono text-slate-700 mt-1">
                    Nominal: {cell.nominalText}
                  </div>

                  <p className="text-xs text-slate-600 mt-2.5 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {cell.description}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-mono text-slate-500 truncate select-all">
                    /c/{cell.cellNumber}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(cell.cellNumber)}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-medium border border-slate-200 hover:bg-slate-100 text-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                      title="Salin tautan lengkap"
                    >
                      {copiedCell === cell.cellNumber ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Link</span>
                        </>
                      )}
                    </button>

                    <Link
                      href={`/c/${cell.cellNumber}`}
                      target="_blank"
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition flex items-center gap-1.5 shadow-xs"
                    >
                      <span>Buka Chat</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-800 font-medium">
            ← Kembali ke Beranda Utama
          </Link>
          <Link href="/experiment" className="hover:text-slate-800 font-medium">
            Ke Alur Kuesioner Eksperimen Lengkap →
          </Link>
        </div>
      </div>
    </div>
  );
}
