"use client";

import React from "react";
import { ArrowRight, GraduationCap, FileText } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col justify-between max-w-xl mx-auto w-full px-4 py-8">
      {/* Formal University Badge */}
      <div className="bg-slate-100 text-slate-700 text-xs font-semibold py-2 px-4 rounded-xl flex items-center justify-center gap-2 text-center border border-slate-200">
        <GraduationCap className="w-4 h-4 text-slate-700 shrink-0" />
        <span>Fakultas Ilmu Komputer • Universitas Indonesia</span>
      </div>

      {/* Main Academic Card */}
      <div className="my-auto py-6">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm">
            <FileText className="w-7 h-7 text-slate-100" />
          </div>
          <span className="text-xs font-bold text-blue-800 uppercase tracking-wider block mb-1">
            Instrumen Penelitian Tugas Akhir
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug max-w-md mx-auto">
            Penggunaan Asisten Percakapan dalam Pengambilan Keputusan Keuangan
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-2.5 max-w-md mx-auto leading-relaxed">
            Penelitian ini bertujuan untuk menganalisis bagaimana asisten percakapan memengaruhi pertimbangan keputusan pengeluaran dan tabungan pribadi.
          </p>
          <div className="mt-3 text-xs text-slate-500 font-medium">
            Tim Peneliti: Alfian Bassam Firjatullah & Regina Meilani Aruan
          </div>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div>
            <Link
              href="/experiment"
              className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 text-center shadow-sm"
            >
              Mulai Kuesioner Penelitian
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="text-center pt-1">
            <Link
              href="/c"
              className="text-xs text-blue-700 hover:text-blue-900 font-medium inline-flex items-center gap-1 hover:underline"
            >
              Daftar Link Langsung 8 Kombinasi Chatbot (Uji Manipulasi)
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Academic Footer */}
      <footer className="text-center pt-4 border-t border-slate-200 text-[11px] text-slate-400">
        Program Studi Sistem Informasi • Fakultas Ilmu Komputer Universitas Indonesia
      </footer>
    </div>
  );
}
