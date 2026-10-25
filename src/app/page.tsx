"use client";

import React from "react";
import { ShieldAlert, ArrowRight, Bot, BookOpen, Sparkles } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
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

        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
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
            <p className="text-[11px] text-slate-500 text-center mt-3 leading-relaxed">
              Alur: Informed Consent &rarr; Karakteristik &rarr; Skenario &rarr; Chatbot &rarr; Kuesioner Akhir
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
