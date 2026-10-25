"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, ArrowRight, Bot, BookOpen, KeyRound, Sparkles } from "lucide-react";
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
        <span>Simulasi Penelitian Finansial – Universitas Indonesia</span>
      </div>

      {/* Main Card */}
      <div className="my-auto py-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <Bot className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Penelitian Chatbot AI Keputusan Keuangan
          </h1>
          <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
            Eksperimen pengaruh asisten percakapan berbasis kecerdasan buatan dalam pertimbangan keputusan pengeluaran dan tabungan.
          </p>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          {/* Main CTA: Mulai Kuesioner & Eksperimen */}
          <div>
            <Link
              href="/experiment"
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-600/20 transition flex items-center justify-center gap-2 text-center"
            >
              <Sparkles className="w-4 h-4" />
              Mulai Partisipasi Penelitian
              <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-[11px] text-slate-500 text-center mt-2">
              Alur: Informed Consent &rarr; Karakteristik &rarr; Skenario &rarr; Chatbot &rarr; Kuesioner Akhir
            </p>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-xs text-slate-400 font-medium">atau masuk dengan kode sesi</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Secondary: Resume Existing Chatbot Session */}
          <form onSubmit={handleEnterSession} className="space-y-3">
            <div>
              <div className="relative">
                <input
                  type="text"
                  value={sessionIdInput}
                  onChange={(e) => setSessionIdInput(e.target.value)}
                  placeholder="Masukkan Kode Sesi (misal: dev_spending_low_basic)"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-mono"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
              {errorMessage && (
                <p className="text-xs text-rose-600 mt-1.5 font-medium">{errorMessage}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !sessionIdInput.trim()}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 rounded-xl text-xs font-semibold transition"
            >
              {loading ? "Memeriksa Sesi..." : "Buka Sesi Chat"}
            </button>
          </form>
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
