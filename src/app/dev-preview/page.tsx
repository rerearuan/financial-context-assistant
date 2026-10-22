"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Code,
  CheckCircle,
  AlertTriangle,
  Layers,
  Database,
  Sparkles,
  RefreshCw,
} from "lucide-react";

interface FixtureItem {
  id: string;
  title: string;
  conflictLevel: "low" | "high";
  expectedCalculations: {
    balanceAfterAction: number;
    budgetVariance: number;
    liabilitiesDueBeforeIncome: number;
    remainingCashAfterImmediateObligations: number;
    isLiquidityThreatened: boolean;
    isBudgetExceeded: boolean;
    deficitAmount: number;
  };
}

interface ScenarioData {
  id: string;
  code: string;
  title: string;
  actionType: "spending" | "saving";
  descriptionText: string;
  initialAction: {
    type: string;
    amount: number;
    timing: string;
    targetCategory: string;
    description: string;
  };
}

export default function DevPreviewPage() {
  const [data, setData] = useState<{
    scenarios: ScenarioData[];
    fixtures: FixtureItem[];
    devSessions: Array<{ id: string; scenarioId: string; condition: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("spending_low");
  const [creatingCondition, setCreatingCondition] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dev/fixtures")
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleCreateFreshSession = async (
    scenarioId: string,
    condition: "basic" | "context_aware"
  ) => {
    setCreatingCondition(`${scenarioId}_${condition}`);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId,
          condition,
          participantCode: `DEV-NEW-${Math.floor(1000 + Math.random() * 9000)}`,
        }),
      });
      const newSession = await res.json();
      if (newSession.sessionId) {
        window.location.href = `/chat/${newSession.sessionId}`;
      }
    } catch (e) {
      alert("Gagal membuat sesi baru.");
    } finally {
      setCreatingCondition(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mb-3" />
        <p className="text-slate-600 font-medium">Memuat fixtures dan skenario preview...</p>
      </div>
    );
  }

  const currentFixture = data?.fixtures.find((f) => f.id === selectedScenarioId);
  const currentScenario = data?.scenarios.find((s) => s.id === selectedScenarioId);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      {/* Dev Header */}
      <div className="bg-slate-900 text-white px-6 py-4 border-b border-slate-800">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="bg-amber-400 text-slate-900 font-bold text-xs uppercase px-2.5 py-0.5 rounded">
              Development Only
            </span>
            <h1 className="text-lg font-bold">Matriks Eksperimen & Preview Skenario</h1>
          </div>
          <Link
            href="/"
            className="text-xs text-slate-300 hover:text-white flex items-center gap-1"
          >
            Halaman Depan <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <strong>Catatan Peneliti:</strong> Halaman ini disiapkan khusus untuk inspeksi dan pengujian lokal ke-8 kombinasi skenario dan kondisi. Pada deployment eksperimen nyata responden, tautan ke halaman ini dinonaktifkan.
          </div>
        </div>

        {/* 4 Scenarios Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {data?.scenarios.map((sc) => {
            const fixture = data.fixtures.find((f) => f.id === sc.id);
            const isSelected = selectedScenarioId === sc.id;
            return (
              <button
                key={sc.id}
                onClick={() => setSelectedScenarioId(sc.id)}
                className={`p-3 rounded-xl border text-left transition ${
                  isSelected
                    ? "bg-blue-600 text-white border-blue-600 shadow-md"
                    : "bg-white text-slate-800 border-slate-200 hover:border-blue-300"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className={isSelected ? "text-blue-100" : "text-slate-500"}>
                    {sc.actionType === "spending" ? "Spending" : "Saving"}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      isSelected
                        ? "bg-blue-700 text-white"
                        : fixture?.conflictLevel === "high"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {fixture?.conflictLevel.toUpperCase()} CONFLICT
                  </span>
                </div>
                <div className="font-bold text-sm truncate">{sc.title}</div>
                <div className={`text-xs mt-1 truncate ${isSelected ? "text-blue-200" : "text-slate-500"}`}>
                  Rp {sc.initialAction.amount.toLocaleString("id-ID")}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Scenario Details & Live Launchers */}
        {currentScenario && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-600" />
                  {currentScenario.title} ({currentScenario.code})
                </h2>
                <span className="text-xs px-2.5 py-1 rounded bg-slate-100 font-mono text-slate-600 font-semibold">
                  Tipe Tindakan: {currentScenario.actionType.toUpperCase()}
                </span>
              </div>

              <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <strong>Narasi Skenario untuk Responden:</strong>
                <br />
                {currentScenario.descriptionText}
              </p>

              {/* Two Condition Launch Cards */}
              <div className="grid md:grid-cols-2 gap-4 mt-6">
                {/* 1. Basic Assistant */}
                <div className="border border-slate-200 rounded-xl p-5 bg-gradient-to-b from-white to-slate-50/50 hover:shadow-md transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800 uppercase tracking-wider">
                      Kondisi 1
                    </span>
                    <span className="text-xs text-slate-500 font-mono">Tanpa Profil Awal</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">
                    Basic-Information Assistant
                  </h3>
                  <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                    Chatbot TIDAK menerima profil keuangan sintetis saat inisialisasi. Mampu menjawab pertanyaan finansial umum dan menghitung jika pengguna mengetik angka saldo sendiri.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-200">
                    <Link
                      href={`/chat/dev_${currentScenario.id}_basic`}
                      className="flex-1 text-center px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                    >
                      Buka Sesi Fixture <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => handleCreateFreshSession(currentScenario.id, "basic")}
                      disabled={creatingCondition === `${currentScenario.id}_basic`}
                      className="px-3 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition"
                    >
                      {creatingCondition === `${currentScenario.id}_basic` ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" />
                      ) : (
                        "+ Sesi Baru"
                      )}
                    </button>
                  </div>
                </div>

                {/* 2. Context-Aware Assistant */}
                <div className="border border-blue-200 rounded-xl p-5 bg-gradient-to-b from-blue-50/30 to-white hover:shadow-md transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 uppercase tracking-wider">
                      Kondisi 2
                    </span>
                    <span className="text-xs text-blue-600 font-mono flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Dengan Profil Terstruktur
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-blue-950 mb-1">
                    Context-Aware Assistant
                  </h3>
                  <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                    Chatbot menerima profil keuangan sintetis skenario sejak awal. Mengaitkan nominal tindakan dengan saldo kas, sisa anggaran, kewajiban mendesak, dan buffer darurat.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-blue-100">
                    <Link
                      href={`/chat/dev_${currentScenario.id}_context_aware`}
                      className="flex-1 text-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      Buka Sesi Fixture <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => handleCreateFreshSession(currentScenario.id, "context_aware")}
                      disabled={creatingCondition === `${currentScenario.id}_context_aware`}
                      className="px-3 py-2 border border-blue-300 hover:bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold transition"
                    >
                      {creatingCondition === `${currentScenario.id}_context_aware` ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" />
                      ) : (
                        "+ Sesi Baru"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Expected Calculations & Ground Truth Inspector */}
            {currentFixture && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <Database className="w-4 h-4 text-emerald-600" />
                  Hasil Perhitungan Deterministik yang Diharapkan (Expected Ground Truth)
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block">Sisa Saldo Setelah Tindakan</span>
                    <strong className="text-sm text-slate-800">
                      Rp {currentFixture.expectedCalculations.balanceAfterAction.toLocaleString("id-ID")}
                    </strong>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block">Variansi Anggaran Terkait</span>
                    <strong
                      className={`text-sm ${
                        currentFixture.expectedCalculations.budgetVariance < 0
                          ? "text-rose-600"
                          : "text-emerald-600"
                      }`}
                    >
                      {currentFixture.expectedCalculations.budgetVariance < 0 ? "Defisit " : "Surplus "}
                      Rp {Math.abs(currentFixture.expectedCalculations.budgetVariance).toLocaleString("id-ID")}
                    </strong>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block">Kewajiban Sebelum Gaji</span>
                    <strong className="text-sm text-slate-800">
                      Rp {currentFixture.expectedCalculations.liabilitiesDueBeforeIncome.toLocaleString("id-ID")}
                    </strong>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block">Sisa Kas Setelah Kewajiban</span>
                    <strong
                      className={`text-sm ${
                        currentFixture.expectedCalculations.remainingCashAfterImmediateObligations < 0
                          ? "text-rose-600 font-bold"
                          : "text-slate-800"
                      }`}
                    >
                      Rp {currentFixture.expectedCalculations.remainingCashAfterImmediateObligations.toLocaleString("id-ID")}
                    </strong>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-6 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-600">Likuiditas Terancam:</span>
                    {currentFixture.expectedCalculations.isLiquidityThreatened ? (
                      <span className="text-rose-600 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> YA (Defisit Rp{" "}
                        {currentFixture.expectedCalculations.deficitAmount.toLocaleString("id-ID")})
                      </span>
                    ) : (
                      <span className="text-emerald-600 font-bold flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> AMAN
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-600">Melebihi Anggaran:</span>
                    {currentFixture.expectedCalculations.isBudgetExceeded ? (
                      <span className="text-rose-600 font-bold">YA</span>
                    ) : (
                      <span className="text-emerald-600 font-bold">TIDAK</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
