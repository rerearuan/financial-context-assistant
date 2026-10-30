"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { RefreshCw, AlertTriangle, ArrowRight, MessageSquare, Bot } from "lucide-react";
import Link from "next/link";

const CELL_INFO: Record<
  number,
  { title: string; scenario: string; condition: string; conditionLabel: string }
> = {
  1: {
    title: "Kombinasi 1: Pengeluaran (Laptop) - Nominal Rendah",
    scenario: "Pertimbangan Pembelian Laptop (Low Conflict)",
    condition: "basic",
    conditionLabel: "Chatbot Basic",
  },
  2: {
    title: "Kombinasi 2: Pengeluaran (Laptop) - Nominal Rendah",
    scenario: "Pertimbangan Pembelian Laptop (Low Conflict)",
    condition: "context_aware",
    conditionLabel: "Chatbot Context-Aware",
  },
  3: {
    title: "Kombinasi 3: Pengeluaran (Laptop) - Nominal Tinggi",
    scenario: "Pertimbangan Pembelian Laptop (High Conflict)",
    condition: "basic",
    conditionLabel: "Chatbot Basic",
  },
  4: {
    title: "Kombinasi 4: Pengeluaran (Laptop) - Nominal Tinggi",
    scenario: "Pertimbangan Pembelian Laptop (High Conflict)",
    condition: "context_aware",
    conditionLabel: "Chatbot Context-Aware",
  },
  5: {
    title: "Kombinasi 5: Tabungan (Dana Darurat) - Nominal Rendah",
    scenario: "Alokasi Tambahan Tabungan (Low Conflict)",
    condition: "basic",
    conditionLabel: "Chatbot Basic",
  },
  6: {
    title: "Kombinasi 6: Tabungan (Dana Darurat) - Nominal Rendah",
    scenario: "Alokasi Tambahan Tabungan (Low Conflict)",
    condition: "context_aware",
    conditionLabel: "Chatbot Context-Aware",
  },
  7: {
    title: "Kombinasi 7: Tabungan (Dana Darurat) - Nominal Tinggi",
    scenario: "Alokasi Tambahan Tabungan & Sertifikasi (High Conflict)",
    condition: "basic",
    conditionLabel: "Chatbot Basic",
  },
  8: {
    title: "Kombinasi 8: Tabungan (Dana Darurat) - Nominal Tinggi",
    scenario: "Alokasi Tambahan Tabungan & Sertifikasi (High Conflict)",
    condition: "context_aware",
    conditionLabel: "Chatbot Context-Aware",
  },
};

function DirectCellLoader() {
  const params = useParams();
  const router = useRouter();
  const rawCell = params?.cell as string;
  const cellNum = parseInt(rawCell, 10);

  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const isValidCell = !isNaN(cellNum) && cellNum >= 1 && cellNum <= 8;
  const info = isValidCell ? CELL_INFO[cellNum] : null;

  useEffect(() => {
    if (!isValidCell) {
      setError(`Kombinasi #${rawCell} tidak valid. Nomor kombinasi harus antara 1 sampai 8.`);
      setIsInitializing(false);
      return;
    }

    let isMounted = true;

    async function initDirectChat() {
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cellNumber: cellNum,
            source: "form",
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Gagal membuat sesi chatbot.");
        }

        const data = await res.json();
        if (isMounted && data.sessionId) {
          // Immediately redirect to chat
          router.replace(`/chat/${data.sessionId}?cell=${cellNum}&source=form`);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
          setError(msg);
          setIsInitializing(false);
        }
      }
    }

    initDirectChat();

    return () => {
      isMounted = false;
    };
  }, [cellNum, isValidCell, rawCell, router]);

  if (!isValidCell || error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-sm text-center space-y-4">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            {error || "Nomor Kombinasi Tidak Valid"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Sistem menyediakan 8 kombinasi chatbot untuk eksperimen / uji manipulasi. Silakan pilih nomor kombinasi 1 s.d. 8 di bawah ini:
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
              <Link
                key={num}
                href={`/c/${num}`}
                className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-slate-800 text-xs font-semibold transition text-center"
              >
                Kombinasi {num}
              </Link>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100">
            <Link
              href="/c"
              className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
            >
              Lihat Daftar Semua Kombinasi Chatbot
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full shadow-sm text-center space-y-5">
        <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
          <Bot className="w-7 h-7" />
        </div>

        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 inline-block mb-2">
            Kombinasi #{cellNum} • {info?.conditionLabel}
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Mempersiapkan Asisten Percakapan
          </h2>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            {info?.scenario}
          </p>
        </div>

        <div className="flex items-center justify-center gap-2.5 text-xs text-slate-500 pt-2">
          <RefreshCw className="w-4 h-4 text-slate-700 animate-spin" />
          <span>Menghubungkan ke ruang percakapan...</span>
        </div>
      </div>
    </div>
  );
}

export default function DirectCellPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
          <RefreshCw className="w-7 h-7 text-slate-600 animate-spin" />
        </div>
      }
    >
      <DirectCellLoader />
    </Suspense>
  );
}
