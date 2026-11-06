"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  CheckCircle2,
  Clock,
  Ban,
  FileSpreadsheet,
  Download,
  Search,
  Filter,
  RefreshCw,
  LogOut,
  MessageSquare,
  ClipboardList,
  Calendar,
  X,
  ExternalLink,
  ChevronDown,
  Layers,
  ArrowUpDown,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { POST_QUESTIONNAIRE_ITEMS } from "@/lib/survey-questions";

interface CellStat {
  cellNumber: number;
  scenarioId: string;
  condition: string;
  target: number;
  total: number;
  completed: number;
  progressPct: number;
}

interface ParticipantRecord {
  id: string;
  participantCode: string;
  cellNumber: number | null;
  scenarioId: string | null;
  condition: string | null;
  sessionId: string | null;
  currentStep: number;
  isCompleted: boolean;
  disqualified: boolean;
  disqualifiedReason: string | null;
  tanggal: string;
  waktuMulai: string;
  waktuSelesai: string;
  durasiDetik: number;
  messageCount: number;
  demographics: {
    age: string | number;
    gender: string;
    monthlyIncome: string;
    education: string;
    occupation: string;
    financialKnowledge: string;
    chatbotExperience: string;
  };
  earlyDecision: {
    decision?: string;
  };
  finalDecision: {
    decision: string;
    justification: string;
    answers?: Record<string, string>;
  };
  postQuestionnaire: Record<string, number>;
  scaleAverages: {
    AT: number | null;
    MAC: number | null;
    OCC: number | null;
    PFDA: number | null;
    RMAS: number | null;
  };
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  extractedIntent?: {
    intentType: string;
  } | null;
  createdAt: string;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [adminEmail, setAdminEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [stats, setStats] = useState<{
    totalParticipants: number;
    completedCount: number;
    inProgressCount: number;
    disqualifiedCount: number;
    totalSessions: number;
    totalMessages: number;
    cellStats: CellStat[];
  } | null>(null);

  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    host: string;
    error: string | null;
  } | null>(null);

  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCell, setSelectedCell] = useState<string>("all");
  const [selectedCondition, setSelectedCondition] = useState<string>("all");
  const [selectedScenario, setSelectedScenario] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Modals
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [activeParticipantForChat, setActiveParticipantForChat] = useState<ParticipantRecord | null>(null);

  const [activeSurveyParticipant, setActiveSurveyParticipant] = useState<ParticipantRecord | null>(null);

  // Check Auth & Load Data
  const loadDashboardData = async () => {
    try {
      const authRes = await fetch("/api/admin/auth/me");
      if (!authRes.ok) {
        router.replace("/admin/login");
        return;
      }
      const authData = await authRes.json();
      if (!authData.authenticated) {
        router.replace("/admin/login");
        return;
      }
      setAdminEmail(authData.email);

      // Fetch Data
      const dataRes = await fetch("/api/admin/data");
      if (dataRes.ok) {
        const result = await dataRes.json();
        setStats(result.stats);
        if (result.dbStatus) {
          setDbStatus(result.dbStatus);
        }
        setParticipants(result.participants || []);
      }
    } catch (err) {
      console.error("Gagal memuat data admin:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  const handleLogout = async () => {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    startTransition(() => {
      router.push("/admin/login");
    });
  };

  const handleExportExcel = async (format: "xlsx" | "csv" = "xlsx") => {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/export?format=${format}`);
      if (!res.ok) throw new Error("Gagal export");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      a.download = `data-penelitian-skripsi-${timestamp}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Terjadi kesalahan saat mengekspor file. Silakan coba kembali.");
    } finally {
      setExporting(false);
    }
  };

  const openChatModal = async (participant: ParticipantRecord) => {
    if (!participant.sessionId) {
      alert("Partisipan ini belum memiliki sesi percakapan.");
      return;
    }
    setActiveParticipantForChat(participant);
    setActiveChatSessionId(participant.sessionId);
    setLoadingChat(true);

    try {
      const res = await fetch(`/api/admin/messages/${participant.sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data.messages || []);
      }
    } catch {
      alert("Gagal memuat transkrip pesan chat.");
    } finally {
      setLoadingChat(false);
    }
  };

  // Filtered participants
  const filteredParticipants = useMemo(() => {
    return participants.filter((p) => {
      // Cell filter
      if (selectedCell !== "all" && p.cellNumber !== Number(selectedCell)) {
        return false;
      }
      // Condition filter
      if (selectedCondition !== "all" && p.condition !== selectedCondition) {
        return false;
      }
      // Scenario filter
      if (selectedScenario !== "all" && p.scenarioId !== selectedScenario) {
        return false;
      }
      // Status filter
      if (selectedStatus === "completed" && !p.isCompleted) return false;
      if (selectedStatus === "in_progress" && (p.isCompleted || p.disqualified)) return false;
      if (selectedStatus === "disqualified" && !p.disqualified) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const codeMatch = p.participantCode?.toLowerCase().includes(q);
        const idMatch = p.id?.toLowerCase().includes(q);
        const reasonMatch = p.finalDecision?.justification?.toLowerCase().includes(q);
        const occupationMatch = String(p.demographics?.occupation || "").toLowerCase().includes(q);
        const conditionMatch = p.condition?.toLowerCase().includes(q);
        if (!codeMatch && !idMatch && !reasonMatch && !occupationMatch && !conditionMatch) {
          return false;
        }
      }

      return true;
    });
  }, [participants, selectedCell, selectedCondition, selectedScenario, selectedStatus, searchQuery]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4 animate-pulse">
          <FileSpreadsheet className="w-6 h-6 text-white" />
        </div>
        <p className="text-sm font-semibold text-slate-300">Memuat Portal Database Admin...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/25">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  Admin Research Dashboard
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Live DB
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Financial Context-Aware Assistant &bull; Peneliti: <span className="font-semibold text-slate-700">{adminEmail}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh Data Terkini"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-blue-600" : ""}`} />
              <span className="hidden sm:inline">Segarkan</span>
            </button>

            <button
              onClick={() => handleExportExcel("xlsx")}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-70"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel (.xlsx)</span>
            </button>

            <button
              onClick={() => handleExportExcel("csv")}
              disabled={exporting}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            >
              <span>CSV</span>
            </button>

            <button
              onClick={handleLogout}
              title="Keluar dari Portal Admin"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Database Connection Warning Banner if not connected to live DB */}
        {dbStatus && !dbStatus.connected && (
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 shadow-2xs space-y-2">
            <div className="flex items-center gap-2.5 font-bold text-sm text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>Database Cloud Belum Terhubung di Vercel</span>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              Website di Vercel saat ini berjalan tanpa koneksi database PostgreSQL cloud (variabel lingkungan{" "}
              <code className="font-mono bg-amber-200/60 px-1.5 py-0.5 rounded font-bold">DATABASE_URL</code> belum disetting di Vercel).
              Oleh karena itu data partisipan tidak tersimpan di server cloud Vercel. Seluruh 16 data uji coba yang telah dibuat sebelumnya tersimpan di PostgreSQL lokal laptop Anda (
              <code className="font-mono bg-amber-200/60 px-1.5 py-0.5 rounded font-bold">localhost:5432/skripsi_chat</code>).
            </p>
            <div className="pt-1.5 text-xs text-amber-800">
              <strong className="block mb-1">Cara agar responden asli tersimpan permanen di website Vercel:</strong>
              <ol className="list-decimal list-inside space-y-0.5 pl-1 text-[11px] text-amber-900/90">
                <li>Buat database PostgreSQL gratis di <a href="https://neon.tech" target="_blank" rel="noreferrer" className="underline font-bold text-blue-700">Neon.tech</a> atau <a href="https://supabase.com" target="_blank" rel="noreferrer" className="underline font-bold text-blue-700">Supabase</a>.</li>
                <li>Copy connection string PostgreSQL-nya.</li>
                <li>Buka <strong>Vercel Dashboard &rarr; Project Settings &rarr; Environment Variables</strong>, lalu tambahkan key <code className="font-mono font-bold bg-amber-200/60 px-1 py-0.2 rounded">DATABASE_URL</code> dengan value connection string tersebut.</li>
                <li>Redeploy di Vercel, lalu buka link <a href="/api/dev/setup-db" target="_blank" className="underline font-bold text-blue-700">/api/dev/setup-db</a> satu kali untuk otomatis setup tabel.</li>
              </ol>
            </div>
          </div>
        )}

        {/* KPI Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Partisipan</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">{stats?.totalParticipants ?? 0}</span>
              <span className="text-xs text-slate-500 font-medium">responden</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Total terdata di database</p>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Selesai (Completed)</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600">{stats?.completedCount ?? 0}</span>
              <span className="text-xs text-slate-500 font-medium">/ 200 target</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Step 8 &bull; Kuesioner lengkap</p>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Sedang Berjalan</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-amber-600">{stats?.inProgressCount ?? 0}</span>
              <span className="text-xs text-slate-500 font-medium">aktif</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Di tahap Step 1 - Step 7</p>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600">Diskualifikasi</span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <Ban className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-rose-600">{stats?.disqualifiedCount ?? 0}</span>
              <span className="text-xs text-slate-500 font-medium">responden</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Screening out pendapatan</p>
          </div>
        </div>

        {/* 8 Cells Distribution Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Distribusi 8 Sel Eksperimen (25 Kuota per Sel)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Klik kartu sel untuk memfilter tabel langsung ke sel yang dipilih.
              </p>
            </div>
            {selectedCell !== "all" && (
              <button
                onClick={() => setSelectedCell("all")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
              >
                Reset Filter Sel
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {stats?.cellStats.map((c) => {
              const isSelected = selectedCell === String(c.cellNumber);
              const isSaving = c.scenarioId.startsWith("saving");
              return (
                <div
                  key={c.cellNumber}
                  onClick={() => setSelectedCell(isSelected ? "all" : String(c.cellNumber))}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    isSelected
                      ? "bg-blue-50/80 border-blue-600 shadow-xs ring-1 ring-blue-500"
                      : "bg-slate-50/70 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-extrabold text-slate-900">Sel #{c.cellNumber}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                        c.condition === "context_aware"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {c.condition === "context_aware" ? "Context" : "Basic"}
                    </span>
                  </div>
                  <p className="text-[10px] font-medium text-slate-500 truncate" title={c.scenarioId}>
                    {isSaving ? "Tabungan 4Jt" : "Laptop 7Jt"}
                  </p>
                  <div className="mt-2 flex items-baseline justify-between text-xs">
                    <span className="font-extrabold text-slate-900">{c.completed}</span>
                    <span className="text-[10px] text-slate-400">/ 25</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        c.progressPct >= 100 ? "bg-emerald-500" : "bg-blue-600"
                      }`}
                      style={{ width: `${c.progressPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filter and Search Controls */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3.5">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kode partisipan (PART-...), ID, pekerjaan, atau kata kunci alasan..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Sel */}
              <select
                value={selectedCell}
                onChange={(e) => setSelectedCell(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Semua Sel (1-8)</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                  <option key={num} value={String(num)}>
                    Sel #{num}
                  </option>
                ))}
              </select>

              {/* Kondisi */}
              <select
                value={selectedCondition}
                onChange={(e) => setSelectedCondition(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Semua Kondisi</option>
                <option value="basic">Basic (Standard)</option>
                <option value="context_aware">Context-Aware</option>
              </select>

              {/* Skenario */}
              <select
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Semua Skenario</option>
                <option value="spending_low">Spending Low (Laptop 7Jt)</option>
                <option value="spending_high">Spending High (Laptop 7Jt)</option>
                <option value="saving_low">Saving Low (Tabungan 4Jt)</option>
                <option value="saving_high">Saving High (Tabungan 4Jt)</option>
              </select>

              {/* Status */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Semua Status</option>
                <option value="completed">Selesai (Completed)</option>
                <option value="in_progress">Dalam Proses</option>
                <option value="disqualified">Didiskualifikasi</option>
              </select>

              {(selectedCell !== "all" ||
                selectedCondition !== "all" ||
                selectedScenario !== "all" ||
                selectedStatus !== "all" ||
                searchQuery) && (
                <button
                  onClick={() => {
                    setSelectedCell("all");
                    setSelectedCondition("all");
                    setSelectedScenario("all");
                    setSelectedStatus("all");
                    setSearchQuery("");
                  }}
                  className="px-2.5 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 underline cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <span>
              Menampilkan <strong className="text-slate-800">{filteredParticipants.length}</strong> dari total{" "}
              <strong>{participants.length}</strong> responden
            </span>
          </div>
        </div>

        {/* Participants Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-4">No & Partisipan</th>
                  <th className="py-3 px-3">Waktu (WIB)</th>
                  <th className="py-3 px-3">Sel & Kondisi</th>
                  <th className="py-3 px-3">Skenario</th>
                  <th className="py-3 px-3">Demografi</th>
                  <th className="py-3 px-3">Keputusan Akhir</th>
                  <th className="py-3 px-3 text-center">Skor Skala (Rata-rata)</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredParticipants.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-semibold text-sm text-slate-600">Tidak ada data responden yang cocok</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Coba ubah kata kunci pencarian atau bersihkan filter di atas.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredParticipants.map((p, idx) => {
                    const isSaving = p.scenarioId?.startsWith("saving");
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Kode Partisipan */}
                        <td className="py-3.5 px-4 font-medium">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 font-mono text-[10px] w-5 text-right">{idx + 1}</span>
                            <div>
                              <span className="font-mono font-bold text-slate-900">{p.participantCode}</span>
                              <p className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]" title={p.id}>
                                {p.id}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Waktu */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <p className="font-semibold text-slate-800">{p.tanggal}</p>
                          <p className="text-[11px] text-slate-400">{p.waktuMulai}</p>
                        </td>

                        {/* Sel & Kondisi */}
                        <td className="py-3.5 px-3">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="font-extrabold text-slate-900">Sel #{p.cellNumber ?? "-"}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                p.condition === "context_aware"
                                  ? "bg-purple-50 text-purple-700 border border-purple-200"
                                  : "bg-slate-100 text-slate-700 border border-slate-200"
                              }`}
                            >
                              {p.condition === "context_aware" ? "Context-Aware" : "Basic"}
                            </span>
                          </div>
                        </td>

                        {/* Skenario */}
                        <td className="py-3.5 px-3">
                          <span className="font-semibold text-slate-800 block">
                            {isSaving ? "Tabungan 4Jt" : "Laptop 7Jt"}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">{p.scenarioId}</span>
                        </td>

                        {/* Demografi */}
                        <td className="py-3.5 px-3">
                          <p className="text-slate-800">
                            {p.demographics.age !== "-" ? `${p.demographics.age} thn` : "-"},{" "}
                            <span className="text-slate-500">{p.demographics.gender}</span>
                          </p>
                          <p className="text-[11px] text-slate-500 truncate max-w-[140px]" title={String(p.demographics.occupation)}>
                            {p.demographics.occupation}
                          </p>
                        </td>

                        {/* Keputusan Akhir */}
                        <td className="py-3.5 px-3 max-w-[200px]">
                          <span
                            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md mb-1 ${
                              p.finalDecision.decision.includes("tetap")
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : p.finalDecision.decision.includes("batal")
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "bg-slate-100 text-slate-600 border border-slate-200"
                            }`}
                          >
                            {p.finalDecision.decision}
                          </span>
                          <p className="text-[11px] text-slate-600 line-clamp-2 leading-tight" title={p.finalDecision.justification}>
                            {p.finalDecision.justification}
                          </p>
                        </td>

                        {/* Skor Skala */}
                        <td className="py-3.5 px-3 text-center">
                          {p.scaleAverages.AT !== null ? (
                            <div className="inline-grid grid-cols-5 gap-1 text-[10px] text-center font-mono">
                              <span className="px-1 py-0.5 rounded bg-blue-50 text-blue-800" title="AT (Trust)">
                                AT:{p.scaleAverages.AT}
                              </span>
                              <span className="px-1 py-0.5 rounded bg-purple-50 text-purple-800" title="MAC (Anthropomorphism)">
                                MAC:{p.scaleAverages.MAC}
                              </span>
                              <span className="px-1 py-0.5 rounded bg-amber-50 text-amber-800" title="OCC (Cognitive Conflict)">
                                OCC:{p.scaleAverages.OCC}
                              </span>
                              <span className="px-1 py-0.5 rounded bg-emerald-50 text-emerald-800" title="PFDA (Advice Acceptance)">
                                PFDA:{p.scaleAverages.PFDA}
                              </span>
                              <span className="px-1 py-0.5 rounded bg-rose-50 text-rose-800" title="RMAS (Risk Avoidance)">
                                RMAS:{p.scaleAverages.RMAS}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {p.disqualified ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                              <Ban className="w-3 h-3" />
                              Diskualifikasi
                            </span>
                          ) : p.isCompleted ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Selesai
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3" />
                              Step {p.currentStep}
                            </span>
                          )}
                        </td>

                        {/* Aksi */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {p.sessionId && (
                              <button
                                onClick={() => openChatModal(p)}
                                title="Lihat Riwayat Chat"
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => setActiveSurveyParticipant(p)}
                              title="Lihat Detail Kuesioner"
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
                            >
                              <ClipboardList className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* MODAL 1: CHAT TRANSCRIPT VIEWER */}
      {activeChatSessionId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="py-4 px-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Transkrip Chat &bull; {activeParticipantForChat?.participantCode}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">Session ID: {activeChatSessionId}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveChatSessionId(null);
                  setActiveParticipantForChat(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Body */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/30">
              {loadingChat ? (
                <div className="py-12 text-center text-slate-400 text-xs">Memuat transkrip pesan...</div>
              ) : chatMessages.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">Belum ada percakapan dalam sesi ini.</div>
              ) : (
                chatMessages.map((msg, i) => {
                  const isUser = msg.role === "user";
                  return (
                    <div key={msg.id || i} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                      <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-400 px-1">
                        <span className="font-semibold text-slate-600">{isUser ? "Responden" : "Chatbot"}</span>
                        {msg.extractedIntent && (
                          <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 font-mono">
                            {msg.extractedIntent.intentType}
                          </span>
                        )}
                      </div>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed ${
                          isUser
                            ? "bg-blue-600 text-white rounded-tr-xs"
                            : "bg-white border border-slate-200 text-slate-800 shadow-2xs rounded-tl-xs"
                        }`}
                      >
                        <p className="whitespace-pre-line">{msg.content}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="py-3 px-6 border-t border-slate-100 bg-white flex justify-end">
              <button
                onClick={() => {
                  setActiveChatSessionId(null);
                  setActiveParticipantForChat(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: QUESTIONNAIRE BREAKDOWN VIEWER */}
      {activeSurveyParticipant && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="py-4 px-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Detail Kuesioner Akhir &bull; {activeSurveyParticipant.participantCode}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Sel #{activeSurveyParticipant.cellNumber} ({activeSurveyParticipant.condition}) &bull;{" "}
                    {Object.keys(activeSurveyParticipant.postQuestionnaire).length} Pertanyaan Terisi
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveSurveyParticipant(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Keputusan Akhir Responden</h4>
                <p className="text-xs font-bold text-blue-700">{activeSurveyParticipant.finalDecision.decision}</p>
                <p className="text-xs text-slate-600 italic leading-relaxed">
                  &ldquo;{activeSurveyParticipant.finalDecision.justification}&rdquo;
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                  Rincian Jawaban Skala Likert (1 - 7)
                </h4>
                {POST_QUESTIONNAIRE_ITEMS.map((item, idx) => {
                  const val = activeSurveyParticipant.postQuestionnaire[item.code];
                  return (
                    <div
                      key={item.code}
                      className="p-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50/70 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="font-mono text-xs font-bold text-slate-400 shrink-0 w-6">
                          {idx + 1}.
                        </span>
                        <div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold mr-2">
                            {item.code}
                          </span>
                          <span className="text-xs text-slate-800 leading-relaxed">{item.statement}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${
                            val !== undefined
                              ? "bg-blue-600 text-white shadow-2xs"
                              : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          {val ?? "-"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="py-3 px-6 border-t border-slate-100 bg-white flex justify-end">
              <button
                onClick={() => setActiveSurveyParticipant(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
