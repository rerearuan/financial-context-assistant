"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, ArrowRight, Bot, BookOpen, KeyRound } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  const router = useRouter();
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleEnterSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = sessionIdInput.trim();
    if (!trimmed) return;

    setLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch(`/api/sessions/${trimmed}`);
      if (!res.ok) {
        throw new Error("Kode sesi tidak ditemukan atau tidak valid.");
      }
      router.push(`/chat/${trimmed}`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Sesi tidak ditemukan.");
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between max-w-xl mx-auto w-full px-4 py-8">
      {/* Simulation Banner */}
      <div className="bg-amber-500 text-white text-xs font-semibold py-2 px-4 rounded-xl flex items-center justify-center gap-2 text-center shadow-sm">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span>Simulasi Penelitian Finansial – Tidak Terhubung ke Rekening Riil</span>
      </div>

      {/* Main Card */}
      <div className="my-auto py-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <Bot className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Asisten Finansial Percakapan
          </h1>
          <p className="text-sm text-slate-600 mt-2 max-w-sm mx-auto">
            Platform simulasi percakapan interaktif untuk evaluasi keputusan pengeluaran dan tabungan.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <form onSubmit={handleEnterSession} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Masukkan Kode Sesi Partisipan
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={sessionIdInput}
                  onChange={(e) => setSessionIdInput(e.target.value)}
                  placeholder="Contoh: dev_spending_low_basic"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                  required
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              </div>
              {errorMessage && (
                <p className="text-xs text-rose-600 mt-2 font-medium">{errorMessage}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !sessionIdInput.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-bold transition shadow-sm flex items-center justify-center gap-2"
            >
              {loading ? "Memeriksa Sesi..." : "Mulai Percakapan"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500 leading-relaxed">
              Kode sesi diberikan oleh peneliti pada lembar petunjuk eksperimen.
            </p>
          </div>
        </div>
      </div>

      {/* Footer / Researcher link */}
      <footer className="text-center pt-4 border-t border-slate-200">
        <Link
          href="/dev-preview"
          className="text-xs text-slate-400 hover:text-slate-600 inline-flex items-center gap-1.5 transition"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Akses Preview & Matriks Skenario (Khusus Peneliti)
        </Link>
      </footer>
    </div>
  );
}
