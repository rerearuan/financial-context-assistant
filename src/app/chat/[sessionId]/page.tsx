"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  ShieldAlert,
  Send,
  RefreshCw,
  CheckCircle,
  Clock,
  XCircle,
  Edit3,
  AlertTriangle,
  Bot,
  User,
  Info,
  ArrowRight,
} from "lucide-react";

interface ActionData {
  type: "spending" | "saving";
  amount: number;
  timing: string;
  targetCategory: string;
  description: string;
  modifiedByUser?: boolean;
}

interface MessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  sourcesUsed?: string[];
}

interface SessionData {
  sessionId: string;
  participantCode: string;
  scenarioId: string;
  condition: "basic" | "context_aware";
  status: "in_progress" | "proceed" | "modify" | "postpone" | "cancel";
  currentAction: ActionData;
  followupCount: number;
  maxFollowupAllowed: number;
  scenario: {
    id: string;
    title: string;
    actionType: string;
    descriptionText: string;
    quickReplies: string[];
  };
  messages: MessageItem[];
}

function ChatPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const participantId = searchParams.get("participantId");

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);

  // Modification modal state
  const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);
  const [newAmountInput, setNewAmountInput] = useState("");

  // Final confirmation modal state
  const [confirmModalType, setConfirmModalType] = useState<
    "proceed" | "postpone" | "cancel" | null
  >(null);
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchSession = async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) {
        throw new Error("Gagal memuat sesi percakapan. Sesi mungkin tidak ditemukan.");
      }
      const data = await res.json();
      setSession(data);
      setNewAmountInput(data.currentAction.amount.toString());
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) {
      fetchSession();
    }
  }, [sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [session?.messages, isSending]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending || !session) return;

    setInputText("");
    setLastFailedMessage(null);
    setIsSending(true);

    // Optimistically add user message
    const tempUserMsg: MessageItem = {
      id: `temp_${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    setSession((prev) =>
      prev
        ? {
            ...prev,
            messages: [...prev.messages, tempUserMsg],
          }
        : null
    );

    try {
      const res = await fetch(`/api/sessions/${sessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Gagal mengirim pesan.");
      }

      const data = await res.json();

      setSession((prev) => {
        if (!prev) return null;
        // Replace temp message with server messages
        const filtered = prev.messages.filter((m) => m.id !== tempUserMsg.id);
        return {
          ...prev,
          currentAction: data.updatedAction || prev.currentAction,
          followupCount: data.followupCount,
          messages: [
            ...filtered,
            tempUserMsg,
            {
              id: data.assistantMessage.id,
              role: "assistant",
              content: data.assistantMessage.content,
              createdAt: data.assistantMessage.createdAt,
            },
          ],
        };
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Gagal terhubung.";
      setLastFailedMessage(text);
      // Remove the optimistic message so user can retry cleanly without duplicate
      setSession((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.filter((m) => m.id !== tempUserMsg.id),
            }
          : null
      );
      setError(`Gagal mengirim pesan: ${errorMsg}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleExecuteDecision = async (decision: "proceed" | "postpone" | "cancel") => {
    if (!session || isSubmittingDecision) return;
    setIsSubmittingDecision(true);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      if (!res.ok) {
        throw new Error("Gagal mencatat keputusan simulasi.");
      }

      const data = await res.json();
      setConfirmModalType(null);
      await fetchSession();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const handleModifyAmount = async () => {
    const parsedAmount = parseInt(newAmountInput.replace(/\D/g, ""), 10);
    if (!parsedAmount || parsedAmount <= 0) {
      alert("Masukkan nominal yang valid dalam angka.");
      return;
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "modify",
          newAmount: parsedAmount,
        }),
      });

      if (!res.ok) {
        throw new Error("Gagal mengubah nominal tindakan.");
      }

      setIsModifyModalOpen(false);
      await fetchSession();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Terjadi kesalahan.");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-slate-600 font-medium">Memuat sesi percakapan simulasi...</p>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-50 text-red-700 p-6 rounded-xl max-w-md border border-red-200">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-red-500" />
          <h2 className="text-lg font-bold mb-2">Terjadi Kesalahan</h2>
          <p className="text-sm mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 text-sm"
          >
            Muat Ulang Halaman
          </button>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const isCompleted = session.status !== "in_progress";
  const action = session.currentAction;

  return (
    <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto bg-white shadow-sm border-x border-slate-200 h-screen">
      {/* 1. Research Simulation Disclaimer Banner */}
      <div className="bg-amber-500 text-white text-xs font-medium py-1.5 px-4 flex items-center justify-center gap-2 text-center shadow-inner">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span>
          <strong>SIMULASI PENELITIAN:</strong> Seluruh saldo, data finansial, dan transaksi adalah simulasi buatan. Tidak terhubung ke rekening uang nyata.
        </span>
      </div>

      {/* 2. Top Header */}
      <header className="border-b border-slate-200 px-4 py-3 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            Asisten Finansial Percakapan
          </h1>
          <p className="text-xs text-slate-500">
            ID Partisipan: <span className="font-mono font-medium">{session.participantCode}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session.status === "in_progress" && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Sesi Berlangsung
            </span>
          )}
          {session.status === "proceed" && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 gap-1">
              <CheckCircle className="w-3 h-3" /> Transaksi Simulasi Selesai
            </span>
          )}
          {session.status === "postpone" && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 gap-1">
              <Clock className="w-3 h-3" /> Tindakan Ditunda
            </span>
          )}
          {session.status === "cancel" && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 gap-1">
              <XCircle className="w-3 h-3" /> Tindakan Dibatalkan
            </span>
          )}

          {participantId && (
            <button
              onClick={() => router.push(`/experiment?participantId=${participantId}&step=6`)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm ml-2"
            >
              <span>Selesai Diskusi & Lanjut ke Keputusan Akhir</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* 3. Action Under Consideration Summary Card */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span
              className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                action.type === "spending"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {action.type === "spending" ? "Rencana Pengeluaran" : "Rencana Menabung"}
            </span>
            <span className="text-sm font-semibold text-slate-900">
              Rp {action.amount.toLocaleString("id-ID")}
            </span>
            <span className="text-xs text-slate-500 hidden sm:inline">
              ({action.targetCategory} • {action.timing})
            </span>
          </div>

          {!isCompleted && (
            <button
              onClick={() => setIsModifyModalOpen(true)}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
            >
              <Edit3 className="w-3 h-3" /> Ubah Rencana
            </button>
          )}
        </div>
        <p className="text-xs text-slate-600 mt-1 line-clamp-2">
          <strong>Deskripsi:</strong> {session.scenario.descriptionText}
        </p>
      </div>

      {/* 4. Chat Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100/50">
        {session.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2.5 ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-xs"
                  : "bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs"
              }`}
            >
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
            </div>

            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isSending && (
          <div className="flex items-start gap-2.5 justify-start">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white text-slate-600 border border-slate-200 rounded-2xl rounded-bl-xs px-4 py-3 shadow-sm flex items-center gap-2 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Asisten sedang mengevaluasi konsekuensi finansial...</span>
            </div>
          </div>
        )}

        {/* Retry Banner if previous send failed */}
        {lastFailedMessage && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-center justify-between text-xs text-rose-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Pesan sebelumnya gagal terkirim.</span>
            </div>
            <button
              onClick={() => handleSendMessage(lastFailedMessage)}
              className="px-3 py-1 bg-rose-600 text-white font-medium rounded hover:bg-rose-700 transition"
            >
              Coba Lagi
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 5. Quick Replies (Identical on both conditions) */}
      {!isCompleted && !isSending && (
        <div className="bg-white border-t border-slate-200 px-4 py-2 overflow-x-auto flex items-center gap-2 no-scrollbar">
          <span className="text-xs text-slate-400 font-medium shrink-0">Opsi Cepat:</span>
          {session.scenario.quickReplies.map((reply, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(reply)}
              className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 transition shrink-0"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* 6. Final Decision Action Buttons Bar */}
      {!isCompleted && (
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Info className="w-3.5 h-3.5" />
            <span>
              Pertanyaan: <strong>{session.followupCount}</strong> dari {session.maxFollowupAllowed}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsModifyModalOpen(true)}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              Ubah
            </button>
            <button
              onClick={() => setConfirmModalType("postpone")}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              Tunda
            </button>
            <button
              onClick={() => setConfirmModalType("cancel")}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50"
            >
              Batal
            </button>
            <button
              onClick={() => setConfirmModalType("proceed")}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1"
            >
              <CheckCircle className="w-3.5 h-3.5" /> Lanjut
            </button>
          </div>
        </div>
      )}

      {/* 7. Chat Input Footer */}
      <footer className="p-3 bg-white border-t border-slate-200">
        {isCompleted ? (
          <div className="text-center py-3 text-sm text-slate-600 font-medium bg-slate-50 rounded-xl border border-slate-200 p-4">
            <p>Sesi percakapan simulasi ini telah selesai.</p>
            {participantId && (
              <button
                onClick={() => router.push(`/experiment?participantId=${participantId}&step=6`)}
                className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-2 shadow-sm"
              >
                <span>Lanjut ke Kuesioner Penelitian (Tahap 6: Keputusan Akhir)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ketik pertanyaan atau tanggapan finansial Anda..."
              disabled={isSending}
              maxLength={1000}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm disabled:bg-slate-100"
            />
            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl transition shadow-sm shrink-0"
              title="Kirim pesan"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </footer>

      {/* Modal: Ubah Nominal */}
      {isModifyModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-800 mb-1">Sesuaikan Nominal Rencana</h3>
            <p className="text-xs text-slate-500 mb-4">
              Ubah nominal yang sedang dipertimbangkan untuk melihat perhitungannya kembali.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nominal Baru (Rupiah)
              </label>
              <input
                type="number"
                value={newAmountInput}
                onChange={(e) => setNewAmountInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Contoh: 2800000"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsModifyModalOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                onClick={handleModifyAmount}
                className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Konfirmasi Keputusan Simulasi */}
      {confirmModalType && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-bold text-slate-800">
                Konfirmasi Keputusan Simulasi
              </h3>
            </div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              {confirmModalType === "proceed" && (
                <>
                  Anda akan menyelesaikan sesi dengan memilih <strong>LANJUT</strong> pada tindakan sebesar{" "}
                  <strong>Rp {action.amount.toLocaleString("id-ID")}</strong>.
                  <br />
                  <br />
                  <span className="text-slate-500 italic">
                    Catatan: Ini adalah transaksi simulasi untuk tujuan penelitian. Tidak ada uang riil yang dipotong.
                  </span>
                </>
              )}
              {confirmModalType === "postpone" && (
                <>
                  Anda akan menyelesaikan sesi dengan memilih <strong>MENUNDA</strong> tindakan ini untuk sementara waktu.
                </>
              )}
              {confirmModalType === "cancel" && (
                <>
                  Anda akan menyelesaikan sesi dengan memilih <strong>MEMBATALKAN</strong> tindakan ini.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmModalType(null)}
                disabled={isSubmittingDecision}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50"
              >
                Kembali ke Chat
              </button>
              <button
                onClick={() => handleExecuteDecision(confirmModalType)}
                disabled={isSubmittingDecision}
                className={`px-3 py-1.5 text-xs font-bold text-white rounded-lg flex items-center gap-1.5 ${
                  confirmModalType === "proceed"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : confirmModalType === "postpone"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {isSubmittingDecision && <RefreshCw className="w-3 h-3 animate-spin" />}
                Konfirmasi Keputusan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-slate-600 font-medium">Memuat sesi percakapan simulasi...</p>
        </div>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
