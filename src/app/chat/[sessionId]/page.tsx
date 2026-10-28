"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  Send,
  RefreshCw,
  AlertTriangle,
  User,
  ArrowRight,
  MessageSquare,
  FileText,
  Edit3,
  X,
  Info,
  Clock,
} from "lucide-react";
import { ScenarioViewer } from "@/components/ScenarioViewer";

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
    situasiText?: string;
    kondisiKeuanganText?: string;
    tugasText?: string;
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

  // Asynchronous queue state (allows typing and queueing while assistant is thinking)
  interface QueuedMessage {
    id: string;
    text: string;
    createdAt: string;
  }
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const queuedMessagesRef = useRef<QueuedMessage[]>([]);
  const isSendingRef = useRef(false);

  // Modals state
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);
  const [newAmountInput, setNewAmountInput] = useState("");
  const [isSubmittingModify, setIsSubmittingModify] = useState(false);

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
      setNewAmountInput(data.currentAction?.amount?.toString() || "");
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
  }, [session?.messages, isSending, queuedMessages]);

  const handleCancelQueue = (id: string) => {
    queuedMessagesRef.current = queuedMessagesRef.current.filter((q) => q.id !== id);
    setQueuedMessages([...queuedMessagesRef.current]);
  };

  const executeSendMessage = async (text: string) => {
    isSendingRef.current = true;
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

      const assistantMsg: MessageItem = data.assistantMessage
        ? {
            id: data.assistantMessage.id,
            role: "assistant",
            content: data.assistantMessage.content,
            createdAt: data.assistantMessage.createdAt,
          }
        : {
            id: data.messageId || `asst_${Date.now()}`,
            role: "assistant",
            content: data.reply || "Maaf, respon tidak dapat diproses.",
            createdAt: new Date().toISOString(),
          };

      setSession((prev) => {
        if (!prev) return null;
        const filtered = prev.messages.filter((m) => m.id !== tempUserMsg.id);
        return {
          ...prev,
          currentAction: data.updatedAction || prev.currentAction,
          followupCount: data.followupCount ?? prev.followupCount,
          messages: [...filtered, tempUserMsg, assistantMsg],
        };
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Gagal terhubung.";
      setLastFailedMessage(text);
      // Remove optimistic message on failure so retry works cleanly
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
      // Process next queued message if available (Async Queue)
      if (queuedMessagesRef.current.length > 0) {
        const nextItem = queuedMessagesRef.current.shift()!;
        setQueuedMessages([...queuedMessagesRef.current]);
        executeSendMessage(nextItem.text);
      } else {
        isSendingRef.current = false;
        setIsSending(false);
      }
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || !session) return;

    setInputText("");
    setLastFailedMessage(null);

    // If currently generating a response, queue the next prompt asynchronously!
    if (isSendingRef.current) {
      const queuedItem: QueuedMessage = {
        id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        text,
        createdAt: new Date().toISOString(),
      };
      queuedMessagesRef.current.push(queuedItem);
      setQueuedMessages([...queuedMessagesRef.current]);
      return;
    }

    await executeSendMessage(text);
  };

  const handleModifyAmount = async () => {
    const parsedAmount = parseInt(newAmountInput.replace(/\D/g, ""), 10);
    if (!parsedAmount || parsedAmount <= 0) {
      alert("Masukkan nominal yang valid dalam angka.");
      return;
    }

    setIsSubmittingModify(true);
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
    } finally {
      setIsSubmittingModify(false);
    }
  };

  const handleFinishDiscussion = () => {
    if (participantId) {
      router.push(`/experiment?participantId=${participantId}&step=6`);
    } else {
      router.push(`/experiment`);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 space-y-4">
        <RefreshCw className="w-8 h-8 text-slate-700 animate-spin" />
        <p className="text-slate-600 font-medium text-sm">Memuat sesi percakapan simulasi...</p>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex-1 min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50">
        <div className="bg-white border border-rose-200 rounded-2xl p-6 max-w-md w-full shadow-sm text-center">
          <AlertTriangle className="w-10 h-10 text-rose-600 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-800 mb-1">Gagal Membuka Sesi</h2>
          <p className="text-xs text-slate-600 mb-4">{error}</p>
          <button
            onClick={fetchSession}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const action = session.currentAction;
  const quickReplies = session.scenario.quickReplies || [
    "Apa dampaknya terhadap kondisi keuangan saya?",
    "Bagaimana jika nominalnya dikurangi?",
    "Bagaimana pengaruhnya terhadap kewajiban pembayaran terdekat?",
    "Apakah sisa saldo masih mencukupi untuk kebutuhan?",
  ];

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto bg-white shadow-sm border-x border-slate-200">
      {/* 1. Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 sm:px-6 flex items-center justify-between sticky top-0 z-10 shadow-xs">
        <div>
          <h1 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-slate-800" />
            Asisten Percakapan Finansial
          </h1>
          <p className="text-xs text-slate-500">
            ID Partisipan: <span className="font-mono font-medium">{session.participantCode}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleFinishDiscussion}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <span>Selesai Diskusi & Lanjut ke Keputusan Akhir</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 2. Action Under Consideration Summary Bar (Neutral & Objective) */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 sm:px-6 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[11px] ${
              action.type === "spending"
                ? "bg-rose-100 text-rose-700"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {action.type === "spending" ? "Rencana Pengeluaran" : "Rencana Menabung"}
          </span>
          <span className="font-bold text-slate-900 text-sm">
            Rp {action.amount.toLocaleString("id-ID")}
          </span>
          <span className="text-slate-500">
            • {action.targetCategory} • Waktu: {action.timing}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsProfileModalOpen(true)}
            className="px-2.5 py-1 text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg font-medium flex items-center gap-1 transition"
          >
            <FileText className="w-3 h-3 text-slate-600" />
            <span>Lihat Profil & Skenario</span>
          </button>
          <button
            onClick={() => setIsModifyModalOpen(true)}
            className="px-2.5 py-1 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg font-medium flex items-center gap-1 transition"
          >
            <Edit3 className="w-3 h-3" />
            <span>Ubah Rencana</span>
          </button>
        </div>
      </div>

      {/* 3. Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/70">
        {session.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2.5 ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0 shadow-xs">
                <MessageSquare className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-xs ${
                msg.role === "user"
                  ? "bg-slate-900 text-white rounded-br-xs"
                  : "bg-white text-slate-800 border border-slate-200 rounded-bl-xs"
              }`}
            >
              <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </div>
            </div>

            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {/* Queued Messages (Async Queue: messages typed while assistant is thinking) */}
        {queuedMessages.map((q) => (
          <div key={q.id} className="flex items-start gap-2.5 justify-end">
            <div className="bg-slate-800 text-white rounded-2xl rounded-br-xs px-4 py-3 shadow-xs max-w-[85%] sm:max-w-[75%] border border-slate-700">
              <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                {q.text}
              </div>
              <div className="flex items-center justify-between gap-3 mt-1.5 pt-1.5 border-t border-slate-700 text-[10px] text-slate-300">
                <span className="flex items-center gap-1.5 text-amber-300">
                  <Clock className="w-3 h-3 animate-pulse" />
                  Dalam antrean — otomatis dikirim berikutnya
                </span>
                <button
                  type="button"
                  onClick={() => handleCancelQueue(q.id)}
                  className="hover:text-rose-300 underline cursor-pointer"
                >
                  Batalkan
                </button>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
          </div>
        ))}

        {/* Active thinking indicator */}
        {isSending && (
          <div className="flex items-start gap-2.5 justify-start">
            <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0 shadow-xs animate-pulse">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="bg-white text-slate-600 border border-slate-200 rounded-2xl rounded-bl-xs px-4 py-3 shadow-xs flex items-center gap-2 text-xs sm:text-sm">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-700" />
              <span>Asisten sedang mengevaluasi konsekuensi finansial...</span>
            </div>
          </div>
        )}

        {/* Retry Banner if previous send failed */}
        {lastFailedMessage && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-center justify-between text-xs text-rose-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Pesan sebelumnya gagal terkirim.</span>
            </div>
            <button
              onClick={() => handleSendMessage(lastFailedMessage)}
              className="px-3 py-1 bg-rose-600 text-white font-medium rounded-lg hover:bg-rose-700 transition"
            >
              Coba Lagi
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 4. Quick Replies (Accessible anytime, queues if assistant is busy) */}
      {quickReplies.length > 0 && (
        <div className="bg-white border-t border-slate-200 px-4 py-2 overflow-x-auto flex items-center gap-2 no-scrollbar">
          <span className="text-xs text-slate-400 font-medium shrink-0">Opsi Pertanyaan:</span>
          {quickReplies.map((reply, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(reply)}
              className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 transition shrink-0 cursor-pointer"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* 5. Interaction Counter Status Bar */}
      <div className="bg-slate-50 border-t border-slate-200 px-4 py-1.5 flex items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <Info className="w-3 h-3 text-slate-400" />
          <span>
            Interaksi: <strong>{session.followupCount}</strong> dari {session.maxFollowupAllowed} pertanyaan
          </span>
        </div>
        <div>
          <span>Klik tombol di kanan atas untuk lanjut ke tahap Keputusan Akhir kapan saja.</span>
        </div>
      </div>

      {/* 6. Chat Input Footer (Always enabled for async prompt typing) */}
      <footer className="p-3 sm:p-4 bg-white border-t border-slate-200">
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
            placeholder={
              isSending
                ? "Ketik prompt berikutnya (akan otomatis dikirim saat asisten selesai)..."
                : "Ketik pertanyaan atau tanggapan finansial Anda..."
            }
            maxLength={1000}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent text-xs sm:text-sm"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl transition shadow-xs shrink-0 flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
            title={isSending ? "Antrekan prompt berikutnya" : "Kirim pesan"}
          >
            <Send className="w-4 h-4" />
            {isSending && (
              <span className="text-xs font-medium hidden sm:inline">
                Antrekan
              </span>
            )}
          </button>
        </form>
      </footer>

      {/* MODAL: Lihat Profil & Skenario (Identical on both conditions) */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-xl border border-slate-200">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Profil & Skenario Finansial
              </h3>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 max-h-[75vh]">
              {session.scenario.tugasText && (
                <div className="bg-blue-50/70 text-blue-950 p-3 rounded-xl border border-blue-200 text-xs">
                  <span className="font-bold block mb-0.5">Tugas Simulasi:</span>
                  <p>{session.scenario.tugasText}</p>
                </div>
              )}

              <ScenarioViewer scenario={session.scenario} compact />
            </div>

            <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Sesuaikan Nominal Rencana */}
      {isModifyModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 mb-1">Sesuaikan Nominal Rencana</h3>
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
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-slate-800 focus:outline-none"
                placeholder="Contoh: 14000000"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsModifyModalOpen(false)}
                disabled={isSubmittingModify}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                onClick={handleModifyAmount}
                disabled={isSubmittingModify}
                className="px-3.5 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5 shadow-sm"
              >
                {isSubmittingModify && <RefreshCw className="w-3 h-3 animate-spin" />}
                Simpan Perubahan
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
        <div className="flex-1 min-h-screen flex flex-col items-center justify-center p-6 space-y-4 bg-slate-50">
          <RefreshCw className="w-8 h-8 text-slate-700 animate-spin" />
          <p className="text-slate-600 font-medium text-sm">Memuat sesi percakapan simulasi...</p>
        </div>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
