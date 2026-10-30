"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { RefreshCw, AlertTriangle, Bot } from "lucide-react";

function DirectCellLoader() {
  const params = useParams();
  const router = useRouter();
  const rawCell = params?.cell as string;
  const cellNum = parseInt(rawCell, 10);

  const [error, setError] = useState<string | null>(null);
  const isValidCell = !isNaN(cellNum) && cellNum >= 1 && cellNum <= 8;

  useEffect(() => {
    if (!isValidCell) {
      setError("Tautan sesi yang Anda tuju tidak valid.");
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
          throw new Error(errData.error || "Gagal membuat sesi percakapan.");
        }

        const data = await res.json();
        if (isMounted && data.sessionId) {
          // Immediately redirect to chat without leaking cell number in the URL
          router.replace(`/chat/${data.sessionId}?source=form`);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
          setError(msg);
        }
      }
    }

    initDirectChat();

    return () => {
      isMounted = false;
    };
  }, [cellNum, isValidCell, router]);

  if (!isValidCell || error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-sm text-center space-y-4">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Sesi Tidak Ditemukan
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            {error || "Tautan yang Anda tuju tidak valid. Silakan periksa kembali tautan yang terdapat pada formulir penelitian Anda."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full shadow-sm text-center space-y-4">
        <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center mx-auto shadow-xs">
          <Bot className="w-7 h-7 text-slate-100" />
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Asisten Percakapan Finansial
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Menghubungkan ke ruang percakapan...
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-slate-400 pt-1">
          <RefreshCw className="w-4 h-4 text-slate-600 animate-spin" />
          <span>Memuat sesi...</span>
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
