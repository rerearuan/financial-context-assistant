"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  HelpCircle,
  Bot,
  User,
  ExternalLink,
  Lock,
  AlertTriangle,
  Award,
  FileText,
} from "lucide-react";
import { ScenarioViewer } from "@/components/ScenarioViewer";
import {
  POST_QUESTIONNAIRE_ITEMS,
  LIKERT_OPTIONS,
  DEMOGRAPHIC_OPTIONS,
} from "@/lib/survey-questions";
import { COMPREHENSION_QUESTIONS_BY_SCENARIO } from "@/fixtures/scenarios";

interface ParticipantData {
  id: string;
  participantCode: string;
  consent: boolean;
  cellNumber?: number;
  scenarioId?: string;
  condition?: "basic" | "context_aware";
  sessionId?: string;
  currentStep: number;
  isCompleted: boolean;
  disqualified: boolean;
  disqualifiedReason?: string;
}

interface ScenarioDetails {
  id: string;
  code: string;
  title: string;
  actionType: "spending" | "saving";
  situasiText: string;
  kondisiKeuanganText: string;
  tugasText: string;
  descriptionText: string;
  comprehensionQuestions?: Array<{
    id: string;
    question: string;
    options: string[];
    correctAnswer: string;
  }>;
  tugasQuestions: Array<{
    id: string;
    question: string;
    options?: string[];
    type: "radio" | "text";
  }>;
}

function ExperimentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<number>(1);
  const [participant, setParticipant] = useState<ParticipantData | null>(null);
  const [scenario, setScenario] = useState<ScenarioDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  // Step 1: Consent
  const [consentChoice, setConsentChoice] = useState<string>("");

  // Step 2: Demographics
  const [demographics, setDemographics] = useState({
    age: "",
    gender: "",
    education: "",
    occupation: "",
    monthlyIncome: "",
    chatbotExperience: "",
    financialKnowledge: "",
  });
  const [occupationOther, setOccupationOther] = useState("");

  // Step 4: Comprehension Check & Early Decision
  const [comprehension, setComprehension] = useState<Record<string, string>>({});
  const [earlyDecision, setEarlyDecision] = useState({
    q1: "",
    q2: "",
    q3: "",
  });

  // Step 6: Final Decision
  const [finalDecision, setFinalDecision] = useState({
    q1: "",
    q2: "",
    q3: "",
  });

  // Step 7: Post Questionnaire (Likert 1-5)
  const [postAnswers, setPostAnswers] = useState<Record<string, number>>({});

  // Initialize or fetch participant from query param / localStorage
  useEffect(() => {
    const initParticipant = async () => {
      setLoading(true);
      const urlPartId = searchParams.get("participantId");
      const urlStep = searchParams.get("step");
      const savedPartId = urlPartId || localStorage.getItem("exp_participant_id");

      if (savedPartId) {
        try {
          const res = await fetch(`/api/experiment/${savedPartId}`);
          if (res.ok) {
            const data = await res.json();
            setParticipant(data.participant);
            if (data.scenario) setScenario(data.scenario);

            if (urlStep) {
              setStep(parseInt(urlStep, 10));
            } else {
              setStep(data.participant.currentStep || 1);
            }
            setLoading(false);
            return;
          }
        } catch (e) {
          console.error("Gagal memuat partisipan yang ada:", e);
        }
      }

      // If no valid participant, start a new one
      try {
        const res = await fetch("/api/experiment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        });
        const data = await res.json();
        if (data.participant) {
          setParticipant(data.participant);
          localStorage.setItem("exp_participant_id", data.participant.id);
          setStep(1);
        } else {
          setErrorMessage(data.error || "Gagal menginisialisasi sesi penelitian.");
        }
      } catch (err) {
        setErrorMessage("Gagal menginisialisasi sesi penelitian.");
      } finally {
        setLoading(false);
      }
    };

    initParticipant();
  }, [searchParams]);

  // Copy-Paste Prevention Handler
  const handlePreventCopy = (e: React.ClipboardEvent) => {
    e.preventDefault();
  };

  // Submit Step 1: Consent
  const handleConsentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consentChoice || !participant) return;

    setSubmitting(true);
    setErrorMessage(null);

    const isConsented = consentChoice === "yes";
    try {
      const res = await fetch("/api/experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "consent",
          participantId: participant.id,
          consent: isConsented,
        }),
      });

      const data = await res.json();
      if (!isConsented || data.disqualified) {
        setParticipant((prev) => (prev ? { ...prev, disqualified: true } : null));
      } else {
        setStep(2);
      }
    } catch {
      setErrorMessage("Terjadi kesalahan saat menyimpan persetujuan.");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Step 2: Demographics
  const handleDemographicsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!participant) return;

    if (
      !demographics.age ||
      !demographics.gender ||
      !demographics.education ||
      !demographics.occupation ||
      !demographics.monthlyIncome ||
      !demographics.chatbotExperience ||
      !demographics.financialKnowledge
    ) {
      alert("Harap lengkapi seluruh pertanyaan karakteristik responden.");
      return;
    }

    if (demographics.occupation === "Lainnya" && !occupationOther.trim()) {
      alert("Harap sebutkan pekerjaan Anda pada kolom yang disediakan.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "demographics",
          participantId: participant.id,
          demographics: {
            ...demographics,
            occupation:
              demographics.occupation === "Lainnya"
                ? `Lainnya (${occupationOther.trim()})`
                : demographics.occupation,
            age: parseInt(demographics.age, 10),
          },
        }),
      });

      const data = await res.json();
      if (data.disqualified) {
        setParticipant((prev) => (prev ? { ...prev, disqualified: true, disqualifiedReason: data.message } : null));
      } else {
        setScenario(data.scenario);
        setParticipant((prev) =>
          prev
            ? {
                ...prev,
                cellNumber: data.cellNumber,
                scenarioId: data.scenarioId,
                condition: data.condition,
                sessionId: data.sessionId,
                currentStep: 3,
              }
            : null
        );
        setStep(3);
      }
    } catch {
      setErrorMessage("Terjadi kesalahan saat menyimpan data demografi.");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Step 4: Comprehension Check & Early Decision
  const handleEarlyDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!participant || !scenario) return;

    const compQuestions =
      scenario.comprehensionQuestions && scenario.comprehensionQuestions.length > 0
        ? scenario.comprehensionQuestions
        : COMPREHENSION_QUESTIONS_BY_SCENARIO[scenario.id] || [];

    const hasAnsweredAllComp = compQuestions.every((q) => Boolean(comprehension[q.id]));

    if (!hasAnsweredAllComp || !earlyDecision.q1 || !earlyDecision.q3.trim()) {
      alert("Mohon jawab seluruh pertanyaan uji pemahaman skenario dan keputusan awal Anda.");
      return;
    }

    if (earlyDecision.q1 === "Ya" && !earlyDecision.q2) {
      alert(
        scenario.actionType === "spending"
          ? "Mohon pilih metode pembayaran jika Anda memilih Ya."
          : "Mohon pilih jumlah penambahan jika Anda memilih Ya."
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "early_decision",
          participantId: participant.id,
          earlyDecision: {
            ...earlyDecision,
            comprehensionCheck: comprehension,
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStep(5);
      }
    } catch {
      setErrorMessage("Terjadi kesalahan saat menyimpan pemahaman dan keputusan awal.");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Step 6: Final Decision (Post Chat)
  const handleFinalDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!participant) return;

    if (!finalDecision.q1 || !finalDecision.q3.trim()) {
      alert("Mohon jawab seluruh pertanyaan keputusan akhir Anda.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "final_decision",
          participantId: participant.id,
          finalDecision,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStep(7);
      }
    } catch {
      setErrorMessage("Terjadi kesalahan saat menyimpan keputusan akhir.");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Step 7: Post Questionnaire
  const handlePostQuestionnaireSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!participant) return;

    // Check completeness
    for (let i = 0; i < POST_QUESTIONNAIRE_ITEMS.length; i++) {
      const item = POST_QUESTIONNAIRE_ITEMS[i];
      if (!postAnswers[item.code]) {
        alert(`Harap isi penilaian untuk pertanyaan nomor ${i + 1}`);
        return;
      }
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "post_questionnaire",
          participantId: participant.id,
          postQuestionnaire: postAnswers,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStep(8);
      }
    } catch {
      setErrorMessage("Terjadi kesalahan saat menyimpan kuesioner akhir.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-600 font-medium">Memuat instrumen penelitian...</p>
      </div>
    );
  }

  // Disqualified Screen
  if (participant?.disqualified) {
    return (
      <div className="flex-1 max-w-xl mx-auto my-auto p-6 text-center">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Sesi Penelitian Selesai</h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            {participant.disqualifiedReason ||
              "Terima kasih atas kesediaan dan waktu Anda. Berdasarkan kriteria penelitian, sesi survei Anda telah selesai."}
          </p>
          <p className="text-xs text-slate-400">
            Alfian Bassam Firjatullah & Regina Meilani Aruan • Universitas Indonesia
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Academic Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-8 h-16 sticky top-0 z-30 flex items-center shadow-2xs">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-sm shrink-0">
              UI
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
                Penelitian Asisten Percakapan dalam Keputusan Keuangan
              </h1>
              <p className="text-xs text-slate-500 truncate">
                Fakultas Ilmu Komputer, Universitas Indonesia
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 ml-2">
            {step > 1 && step < 8 && (
              <button
                type="button"
                onClick={() => setStep((prev) => Math.max(1, prev - 1))}
                className="px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Kembali</span>
              </button>
            )}
            <span className="text-xs sm:text-sm bg-slate-100 px-3 py-1.5 rounded-lg font-mono font-medium text-slate-700 whitespace-nowrap">
              Tahap {step} dari 8
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8 lg:p-10">
        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-sm mb-6 flex items-center gap-2.5 shadow-2xs">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAHAP 1: INFORMASI & PERSETUJUAN PARTISIPASI (INFORMED CONSENT) */}
        {/* ============================================================== */}
        {step === 1 && (
          <div className="max-w-3xl sm:max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-sm">
            <div className="border-b border-slate-100 pb-4 mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                A.1. Informasi dan Persetujuan Partisipasi Penelitian
              </h2>
              <p className="text-base sm:text-lg font-bold text-slate-800 mt-1">
                Penelitian Penggunaan <em>Chatbot AI</em> dalam Pengambilan Keputusan Keuangan
              </p>
            </div>

            <div className="text-sm sm:text-base text-slate-700 space-y-4 leading-relaxed mb-8">
              <p>Kepada responden yang terhormat,</p>
              <p>
                Kami, Alfian Bassam Firjatullah dan Regina Meilani Aruan, mahasiswa Program Studi Sistem Informasi, Fakultas Ilmu Komputer, Universitas Indonesia, sedang melakukan penelitian tugas akhir mengenai penggunaan asisten percakapan berbasis kecerdasan buatan (AI) dalam pengambilan keputusan keuangan.
              </p>
              <p>
                Penelitian ini ditujukan kepada individu yang telah memiliki pendapatan pribadi. Dalam penelitian ini, Anda akan dihadapkan pada sebuah skenario keuangan yang mengharuskan Anda berdiskusi dengan chatbot yang disediakan untuk menjawab sejumlah pertanyaan.
              </p>
              <p>
                Partisipasi Anda bersifat sukarela dan Anda dapat menghentikannya kapan saja tanpa konsekuensi. Jawaban kuesioner dan riwayat percakapan Anda dengan chatbot akan disimpan selama penelitian berlangsung untuk keperluan analisis. Data tersebut akan dijaga kerahasiaannya, hanya dapat diakses oleh tim peneliti, dan digunakan untuk kepentingan akademis. Seluruh data yang dikumpulkan akan dihapus setelah penelitian selesai dan laporan akhir disahkan.
              </p>
              <p>
                Sebagai bentuk apresiasi, tersedia hadiah dengan total nilai Rp500.000 yang akan dibagikan kepada 10 responden beruntung melalui undian.
              </p>
              <p>Terima kasih atas waktu dan kesediaan Anda untuk berpartisipasi.</p>
              <div className="pt-2 text-sm sm:text-base text-slate-600 font-medium">
                Hormat kami,
                <br />
                Alfian Bassam Firjatullah &amp; Regina Meilani Aruan
              </div>
            </div>

            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 mb-8">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-2.5">
                Persetujuan Partisipasi (Informed Consent)
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mb-3 leading-relaxed">
                Dengan memilih <strong>&quot;Ya, saya bersedia&quot;</strong>, Anda menyatakan bahwa:
              </p>
              <ol className="text-xs sm:text-sm text-slate-600 list-decimal list-inside space-y-1.5 leading-relaxed">
                <li>Anda telah membaca dan memahami informasi mengenai tujuan serta prosedur penelitian.</li>
                <li>Anda bersedia berpartisipasi secara sukarela dan memahami bahwa partisipasi dapat dihentikan kapan saja tanpa konsekuensi.</li>
                <li>Anda memahami bahwa jawaban kuesioner dan riwayat percakapan dengan chatbot akan disimpan dan digunakan untuk keperluan analisis penelitian.</li>
                <li>Anda memahami bahwa data penelitian akan dijaga kerahasiaannya, hanya dapat diakses oleh tim peneliti, dan akan dihapus setelah penelitian selesai dan laporan akhir disahkan.</li>
              </ol>
            </div>

            <form onSubmit={handleConsentSubmit} className="space-y-6">
              <div>
                <label className="block text-sm sm:text-base font-bold text-slate-800 mb-3">
                  Apakah Anda bersedia berpartisipasi dalam penelitian ini? *
                </label>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-3.5 p-4 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer text-sm sm:text-base transition">
                    <input
                      type="radio"
                      name="consent"
                      value="yes"
                      checked={consentChoice === "yes"}
                      onChange={(e) => setConsentChoice(e.target.value)}
                      className="w-5 h-5 text-blue-600 cursor-pointer"
                      required
                    />
                    <span className="font-medium text-slate-800">Ya, saya bersedia.</span>
                  </label>
                  <label className="flex items-center gap-3.5 p-4 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer text-sm sm:text-base transition">
                    <input
                      type="radio"
                      name="consent"
                      value="no"
                      checked={consentChoice === "no"}
                      onChange={(e) => setConsentChoice(e.target.value)}
                      className="w-5 h-5 text-blue-600 cursor-pointer"
                      required
                    />
                    <span className="font-medium text-slate-800">Tidak, saya tidak bersedia.</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !consentChoice}
                className="w-full py-3.5 px-6 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl text-sm sm:text-base font-semibold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                {submitting ? "Memproses..." : "Lanjutkan ke Karakteristik Responden"}
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAHAP 2: KARAKTERISTIK RESPONDEN (DEMOGRAFI) */}
        {/* ============================================================== */}
        {step === 2 && (
          <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-sm">
            <div className="border-b border-slate-100 pb-4 mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                Karakteristik Responden
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Mohon lengkapi profil diri Anda di bawah ini secara jujur. Seluruh pertanyaan bertanda bintang (*) wajib diisi.
              </p>
            </div>

            <form onSubmit={handleDemographicsSubmit} className="space-y-6 text-xs sm:text-sm">
              {/* 1. Usia */}
              <div>
                <label className="block font-semibold text-slate-800 mb-1.5">
                  1. Berapa usia Anda? *
                </label>
                <div className="flex items-center gap-2 max-w-xs">
                  <input
                    type="number"
                    min={15}
                    max={100}
                    value={demographics.age}
                    onChange={(e) => setDemographics({ ...demographics, age: e.target.value })}
                    placeholder="Contoh: 23"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                  <span className="text-slate-500 text-xs">tahun</span>
                </div>
              </div>

              {/* 2. Jenis Kelamin */}
              <div>
                <label className="block font-semibold text-slate-800 mb-1.5">
                  2. Apa jenis kelamin Anda? *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {DEMOGRAPHIC_OPTIONS.gender.map((g) => (
                    <label
                      key={g}
                      className={`p-3 rounded-lg border text-center cursor-pointer transition ${
                        demographics.gender === g
                          ? "bg-blue-50 border-blue-600 text-blue-700 font-semibold"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="gender"
                        value={g}
                        checked={demographics.gender === g}
                        onChange={(e) => setDemographics({ ...demographics, gender: e.target.value })}
                        className="sr-only"
                        required
                      />
                      {g}
                    </label>
                  ))}
                </div>
              </div>

              {/* 3. Jenjang Pendidikan */}
              <div>
                <label className="block font-semibold text-slate-800 mb-1.5">
                  3. Apa jenjang pendidikan terakhir atau yang sedang Anda tempuh? *
                </label>
                <select
                  value={demographics.education}
                  onChange={(e) => setDemographics({ ...demographics, education: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  required
                >
                  <option value="">-- Pilih Jenjang Pendidikan --</option>
                  {DEMOGRAPHIC_OPTIONS.education.map((ed) => (
                    <option key={ed} value={ed}>
                      {ed}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Pekerjaan */}
              <div>
                <label className="block font-semibold text-slate-800 mb-1.5">
                  4. Apa pekerjaan saat ini? *
                </label>
                <select
                  value={demographics.occupation}
                  onChange={(e) => setDemographics({ ...demographics, occupation: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  required
                >
                  <option value="">-- Pilih Pekerjaan --</option>
                  {DEMOGRAPHIC_OPTIONS.occupation.map((oc) => (
                    <option key={oc} value={oc}>
                      {oc}
                    </option>
                  ))}
                </select>
                {demographics.occupation === "Lainnya" && (
                  <div className="mt-2.5">
                    <input
                      type="text"
                      value={occupationOther}
                      onChange={(e) => setOccupationOther(e.target.value)}
                      placeholder="Sebutkan pekerjaan Anda..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-xs sm:text-sm"
                      required
                    />
                  </div>
                )}
              </div>

              {/* 5. Pendapatan Bulanan Pribadi (Screening) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="block font-semibold text-slate-800 mb-1.5">
                  5. Berapa pendapatan bulanan pribadi Anda? (tidak termasuk pemberian orang tua) *
                </label>
                <div className="space-y-1.5 mt-2">
                  {DEMOGRAPHIC_OPTIONS.monthlyIncome.map((inc) => (
                    <label
                      key={inc}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer text-xs transition ${
                        demographics.monthlyIncome === inc
                          ? "bg-blue-50 border-blue-600 text-blue-800 font-semibold"
                          : "bg-white border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="monthlyIncome"
                        value={inc}
                        checked={demographics.monthlyIncome === inc}
                        onChange={(e) => setDemographics({ ...demographics, monthlyIncome: e.target.value })}
                        className="w-4 h-4 text-blue-600"
                        required
                      />
                      <span>{inc}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  * Catatan: Partisipan disyaratkan memiliki pendapatan pribadi.
                </p>
              </div>

              {/* 6. Pengalaman Menggunakan Chatbot AI */}
              <div>
                <label className="block font-semibold text-slate-800 mb-1.5">
                  6. Apakah Anda pernah menggunakan chatbot AI untuk mencari informasi atau membantu mempertimbangkan keputusan keuangan pribadi? *
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Contoh: Bertanya kepada chatbot AI (seperti ChatGPT, Gemini, Copilot, atau asisten AI lainnya) mengenai cara mengatur pengeluaran, menyusun anggaran, atau merencanakan tabungan.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {DEMOGRAPHIC_OPTIONS.chatbotExperience.map((exp) => (
                    <label
                      key={exp}
                      className={`p-3 rounded-lg border text-center cursor-pointer transition ${
                        demographics.chatbotExperience === exp
                          ? "bg-blue-50 border-blue-600 text-blue-700 font-semibold"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="chatbotExperience"
                        value={exp}
                        checked={demographics.chatbotExperience === exp}
                        onChange={(e) =>
                          setDemographics({ ...demographics, chatbotExperience: e.target.value })
                        }
                        className="sr-only"
                        required
                      />
                      {exp}
                    </label>
                  ))}
                </div>
              </div>

              {/* 7. Tingkat Pengetahuan Pengelolaan Keuangan Pribadi */}
              <div>
                <label className="block font-semibold text-slate-800 mb-1.5">
                  7. Bagaimana Anda menilai tingkat pengetahuan Anda mengenai pengelolaan keuangan pribadi? *
                </label>
                <div className="grid grid-cols-5 gap-1.5 mt-2">
                  {DEMOGRAPHIC_OPTIONS.financialKnowledge.map((lvl) => (
                    <label
                      key={lvl}
                      className={`p-2.5 rounded-lg border text-center cursor-pointer text-xs transition ${
                        demographics.financialKnowledge === lvl
                          ? "bg-blue-600 border-blue-600 text-white font-semibold"
                          : "border-slate-200 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="financialKnowledge"
                        value={lvl}
                        checked={demographics.financialKnowledge === lvl}
                        onChange={(e) =>
                          setDemographics({ ...demographics, financialKnowledge: e.target.value })
                        }
                        className="sr-only"
                        required
                      />
                      {lvl}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4 pt-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-6 py-3.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-sm sm:text-base font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Kembali
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3.5 px-6 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl text-sm sm:text-base font-semibold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  {submitting ? "Menyimpan..." : "Lanjut ke Petunjuk Eksperimen"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAHAP 3: PETUNJUK EKSPERIMEN                                    */}
        {/* ============================================================== */}
        {step === 3 && (
          <div className="max-w-3xl sm:max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                Petunjuk Eksperimen
              </h2>
            </div>

            <div className="text-sm sm:text-base text-slate-700 space-y-4 leading-relaxed">
              <p>
                Pada bagian ini, Anda akan dihadapkan pada sebuah skenario pengambilan keputusan keuangan dalam kehidupan sehari-hari.
              </p>

              <p>
                Anda akan diberikan informasi mengenai kondisi keuangan, kebutuhan, dan tujuan keuangan yang berkaitan dengan situasi tersebut. Bayangkan bahwa Anda sedang berada dalam situasi yang dijelaskan dan anggap seluruh informasi yang diberikan sebagai kondisi keuangan Anda sendiri.
              </p>

              <p>
                Untuk membantu Anda mempertimbangkan keputusan, tersedia sebuah chatbot yang dapat Anda ajak berdiskusi.
              </p>

              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-2.5">
                <p className="font-semibold text-slate-800 text-sm sm:text-base">
                  Selama berdiskusi dengan chatbot, Anda bebas untuk:
                </p>
                <ul className="space-y-2 pl-5 list-disc text-slate-700 text-sm sm:text-base">
                  <li>mengajukan pertanyaan;</li>
                  <li>meminta perhitungan;</li>
                  <li>meminta assistant membandingkan beberapa pilihan;</li>
                  <li>meminta assistant menjelaskan konsekuensi finansial; atau</li>
                  <li>meminta pertimbangan lain yang menurut Anda diperlukan.</li>
                </ul>
              </div>

              <div className="bg-amber-50/70 border border-amber-200 text-amber-900 p-4 rounded-xl text-sm sm:text-base flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Perhatian:</strong> Anda tidak diperbolehkan copy-paste teks skenario ke dalam percakapan dengan chatbot.
                </span>
              </div>

              <p>
                Setelah selesai berdiskusi dengan chatbot, Anda akan diminta untuk menjawab beberapa pertanyaan mengenai keputusan yang Anda ambil serta alasan di balik keputusan tersebut.
              </p>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-slate-600 text-sm sm:text-base">
                <p>
                  <strong>Tidak ada jawaban benar atau salah.</strong> Pilihlah keputusan yang menurut Anda paling sesuai dengan kondisi keuangan, kebutuhan, dan tujuan yang dijelaskan dalam skenario.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-6 py-3.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-sm sm:text-base font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Kembali
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="flex-1 py-3.5 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm sm:text-base font-semibold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                Lanjut ke Skenario Penelitian
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAHAP 4: SKENARIO & PROFILE (ANTI COPY-PASTE) +                 */}
        {/* COMPREHENSION CHECK & KEPUTUSAN AWAL                           */}
        {/* ============================================================== */}
        {step === 4 && scenario && (
          <div className="space-y-6">
            {/* Petunjuk Singkat & Tombol Baca Ulang */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-sm sm:text-base text-slate-700 leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
              <div>
                <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-1.5 text-base sm:text-lg">
                  <HelpCircle className="w-5 h-5 text-slate-700 shrink-0" />
                  Skenario Pengambilan Keputusan Keuangan
                </h3>
                <p className="text-slate-600 text-xs sm:text-sm">
                  Bayangkan Anda sedang berada dalam situasi berikut dan anggap seluruh informasi sebagai kondisi keuangan Anda sendiri. Anda tidak diperbolehkan copy-paste teks skenario ke chatbot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="self-start sm:self-auto px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl shrink-0 transition cursor-pointer shadow-2xs"
              >
                Baca Petunjuk Lengkap
              </button>
            </div>

            {/* Side by Side Layout: Skenario & Profil (Kiri) vs Comprehension Check (Kanan) */}
            <div className="grid lg:grid-cols-12 gap-6 sm:gap-8 items-start">
              {/* Kolom Kiri: Skenario + Profil Keuangan */}
              <div
                className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm select-none relative"
                style={{
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  MozUserSelect: "none",
                }}
                onCopy={handlePreventCopy}
                onCut={handlePreventCopy}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className="pb-3 mb-5 border-b border-slate-100">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    Materi Skenario Penelitian
                  </h3>
                </div>

                <ScenarioViewer scenario={scenario} />
              </div>

              {/* Kolom Kanan: Comprehension Check / Tugas Keputusan Awal */}
              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-sm sticky top-20">
                <div className="pb-3 mb-5 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                    Uji Pemahaman & Keputusan Awal
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
                    Silakan jawab pertanyaan pemahaman skenario dan tentukan pertimbangan awal Anda sebelum berdiskusi dengan chatbot.
                  </p>
                </div>

                <form onSubmit={handleEarlyDecisionSubmit} className="space-y-5 text-sm sm:text-base">
                  {/* Bagian A: Comprehension Check (Uji Pemahaman Skenario) */}
                  <div className="bg-slate-50 p-4 sm:p-5 rounded-xl border border-slate-200 space-y-4">
                    <div className="font-bold text-xs sm:text-sm text-blue-900 uppercase tracking-wider pb-1.5 border-b border-slate-200 flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-blue-600" />
                      Bagian 1: Uji Pemahaman Skenario
                    </div>

                    {/* Pertanyaan Dinamis Uji Pemahaman dari PDF Instrumen */}
                    {(() => {
                      const compQuestions =
                        scenario.comprehensionQuestions && scenario.comprehensionQuestions.length > 0
                          ? scenario.comprehensionQuestions
                          : COMPREHENSION_QUESTIONS_BY_SCENARIO[scenario.id] || [];

                      return compQuestions.map((q, idx) => (
                        <div key={q.id}>
                          <label className="block font-semibold text-slate-800 mb-2 text-sm sm:text-base leading-snug">
                            {idx + 1}. {q.question} *
                          </label>
                          <div className="space-y-2">
                            {q.options.map((opt) => (
                              <label
                                key={opt}
                                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer text-xs sm:text-sm transition ${
                                  comprehension[q.id] === opt
                                    ? "bg-blue-50 border-blue-600 text-blue-800 font-semibold shadow-2xs"
                                    : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`comp_${q.id}`}
                                  value={opt}
                                  checked={comprehension[q.id] === opt}
                                  onChange={(e) =>
                                    setComprehension((prev) => ({ ...prev, [q.id]: e.target.value }))
                                  }
                                  className="mt-0.5 text-blue-600 cursor-pointer"
                                  required
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Bagian B: Pertimbangan Keputusan Awal */}
                  <div className="space-y-4 pt-2">
                    <div className="font-bold text-xs sm:text-sm text-slate-800 uppercase tracking-wider pb-1.5 border-b border-slate-200">
                      Bagian 2: Pertimbangan Keputusan Awal
                    </div>

                    {/* Pertanyaan 3 */}
                    <div>
                      <label className="block font-semibold text-slate-800 mb-2 text-sm sm:text-base leading-snug">
                        3. Sebelum berdiskusi dengan chatbot, apakah Anda berencana melakukan {scenario.actionType === "spending" ? "pembelian laptop tersebut?" : "penambahan Dana Darurat dari pendapatan bulan ini?"} *
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {["Ya", "Tidak"].map((opt) => (
                          <label
                            key={opt}
                            className={`p-3 sm:p-3.5 rounded-xl border text-center cursor-pointer text-sm font-semibold transition ${
                              earlyDecision.q1 === opt
                                ? "bg-blue-50 border-blue-600 text-blue-700 font-bold shadow-2xs"
                                : "border-slate-200 hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <input
                              type="radio"
                              name="early_q1"
                              value={opt}
                              checked={earlyDecision.q1 === opt}
                              onChange={(e) => setEarlyDecision({ ...earlyDecision, q1: e.target.value })}
                              className="sr-only"
                              required
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Pertanyaan 4 */}
                    {earlyDecision.q1 === "Ya" && (
                      <div>
                        <label className="block font-semibold text-slate-800 mb-2 text-sm sm:text-base leading-snug">
                          4. {scenario.actionType === "spending"
                            ? "Metode pembayaran apa yang Anda rencanakan?"
                            : "Berapa jumlah yang rencananya akan Anda tambahkan?"} *
                        </label>
                        <div className="space-y-2">
                          {(scenario.actionType === "spending"
                            ? ["Tunai (Rp7.000.000)", "Cicilan (12 bulan)"]
                            : ["Rp1.000.000", "Rp2.000.000", "Rp3.000.000", "Jumlah lainnya"]
                          ).map((opt) => (
                            <label
                              key={opt}
                              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer text-xs sm:text-sm transition ${
                                earlyDecision.q2 === opt
                                  ? "bg-blue-50 border-blue-600 text-blue-800 font-semibold shadow-2xs"
                                  : "border-slate-200 hover:bg-slate-50 text-slate-700"
                              }`}
                            >
                              <input
                                type="radio"
                                name="early_q2"
                                value={opt}
                                checked={earlyDecision.q2 === opt}
                                onChange={(e) => setEarlyDecision({ ...earlyDecision, q2: e.target.value })}
                                className="w-4 h-4 text-blue-600 cursor-pointer"
                                required={earlyDecision.q1 === "Ya"}
                              />
                              <span>{opt}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pertanyaan 5 */}
                    <div>
                      <label className="block font-semibold text-slate-800 mb-2 text-sm sm:text-base leading-snug">
                        5. Jelaskan alasan pertimbangan keputusan awal Anda! *
                      </label>
                      <textarea
                        rows={3}
                        value={earlyDecision.q3}
                        onChange={(e) => setEarlyDecision({ ...earlyDecision, q3: e.target.value })}
                        placeholder="Tuliskan alasan pertimbangan Anda berdasarkan kondisi keuangan di samping..."
                        className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs sm:text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="px-4 py-3 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Kembali ke Petunjuk
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-3 px-5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                    >
                      {submitting ? "Menyimpan..." : "Simpan & Lanjut ke Chatbot"}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAHAP 5: PENGANTAR MASUK KE CHATBOT                             */}
        {/* ============================================================== */}
        {step === 5 && participant && (
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-sm">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-3">
              Diskusi dengan Chatbot
            </h2>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-6">
              Untuk membantu Anda mempertimbangkan keputusan, tersedia sebuah chatbot yang dapat Anda ajak berdiskusi mengenai skenario keuangan yang telah Anda pelajari.
            </p>

            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 mb-5 text-sm sm:text-base">
              <p className="font-semibold text-slate-800 mb-2.5">
                Selama berdiskusi dengan chatbot, Anda bebas untuk:
              </p>
              <ul className="space-y-2 pl-5 list-disc text-slate-700">
                <li>mengajukan pertanyaan;</li>
                <li>meminta perhitungan;</li>
                <li>meminta assistant membandingkan beberapa pilihan;</li>
                <li>meminta assistant menjelaskan konsekuensi finansial; atau</li>
                <li>meminta pertimbangan lain yang menurut Anda diperlukan.</li>
              </ul>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 text-amber-900 p-4 rounded-xl text-xs sm:text-sm mb-8 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Pengingat:</strong> Anda tidak diperbolehkan copy-paste teks skenario ke dalam percakapan dengan chatbot.
              </span>
            </div>

            <div className="space-y-4">
              <a
                href={`/chat/${participant.sessionId}?participantId=${participant.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm sm:text-base font-bold transition flex items-center justify-center gap-2.5 text-center shadow-sm cursor-pointer"
              >
                Buka Chatbot Finansial
                <ExternalLink className="w-5 h-5" />
              </a>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="text-xs sm:text-sm text-slate-500 hover:text-slate-800 transition flex items-center gap-1.5 cursor-pointer font-medium"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Kembali ke Skenario
                </button>
                <button
                  type="button"
                  onClick={() => setStep(6)}
                  className="text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-900 transition flex items-center gap-1.5 cursor-pointer"
                >
                  Lanjut ke Keputusan Akhir
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAHAP 6: KEPUTUSAN AKHIR (INDEPENDENT, BEDA SLIDE) */}
        {/* ============================================================== */}
        {step === 6 && scenario && (
          <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-sm">
            <div className="border-b border-slate-100 pb-4 mb-6">
              <span className="text-xs sm:text-sm font-semibold text-emerald-600 uppercase tracking-wider">
                Tahap 6
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                Pertanyaan Keputusan Akhir
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Setelah berdiskusi dengan chatbot, mohon tetapkan keputusan akhir Anda mengenai tindakan pada skenario.
              </p>
            </div>

            <form onSubmit={handleFinalDecisionSubmit} className="space-y-6 text-sm sm:text-base">
              {/* 1. Keputusan Akhir */}
              <div>
                <label className="block font-semibold text-slate-800 mb-2.5 text-sm sm:text-base">
                  1. Setelah berdiskusi dengan chatbot, apakah Anda akan melakukan {scenario.actionType === "spending" ? "pembelian laptop tersebut?" : "penambahan Dana Darurat dari pendapatan bulan ini?"} *
                </label>
                <div className="grid grid-cols-2 gap-3.5">
                  {["Ya", "Tidak"].map((opt) => (
                    <label
                      key={opt}
                      className={`p-3.5 sm:p-4 rounded-xl border text-center cursor-pointer font-bold text-sm sm:text-base transition ${
                        finalDecision.q1 === opt
                          ? "bg-blue-50 border-blue-600 text-blue-700 shadow-sm"
                          : "border-slate-200 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="final_q1"
                        value={opt}
                        checked={finalDecision.q1 === opt}
                        onChange={(e) => setFinalDecision({ ...finalDecision, q1: e.target.value })}
                        className="sr-only"
                        required
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

              {/* 2. Metode Pembayaran / Jumlah Tambahan */}
              {finalDecision.q1 === "Ya" && (
                <div>
                  <label className="block font-semibold text-slate-800 mb-2.5 text-sm sm:text-base">
                    2. {scenario.actionType === "spending"
                      ? "Jika Ya, metode pembayaran apa yang Anda gunakan? mengapa?"
                      : "Jika Ya, berapa jumlah yang akan Anda tambahkan?"} *
                  </label>
                  <div className="space-y-2.5">
                    {(scenario.actionType === "spending"
                      ? ["Tunai (Rp7.000.000)", "Cicilan (12 bulan)"]
                      : ["Rp1.000.000", "Rp2.000.000", "Rp3.000.000", "Jumlah lainnya"]
                    ).map((opt) => (
                      <label
                        key={opt}
                        className={`flex items-center gap-3.5 p-3.5 rounded-xl border cursor-pointer transition text-sm sm:text-base ${
                          finalDecision.q2 === opt
                            ? "bg-blue-50 border-blue-600 text-blue-800 font-semibold shadow-2xs"
                            : "border-slate-200 hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <input
                          type="radio"
                          name="final_q2"
                          value={opt}
                          checked={finalDecision.q2 === opt}
                          onChange={(e) => setFinalDecision({ ...finalDecision, q2: e.target.value })}
                          className="w-4 h-4 text-blue-600 cursor-pointer"
                          required={finalDecision.q1 === "Ya"}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Alasan Keputusan Akhir */}
              <div>
                <label className="block font-semibold text-slate-800 mb-2 text-sm sm:text-base">
                  3. Jelaskan alasan keputusan akhir Anda! *
                </label>
                <textarea
                  rows={4}
                  value={finalDecision.q3}
                  onChange={(e) => setFinalDecision({ ...finalDecision, q3: e.target.value })}
                  placeholder="Jelaskan secara lengkap pertimbangan dan alasan di balik keputusan akhir Anda setelah berdiskusi dengan chatbot..."
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm sm:text-base"
                  required
                />
              </div>

              <div className="flex items-center gap-4 pt-3">
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="px-6 py-3.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-sm sm:text-base font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Buka Chatbot Lagi
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3.5 px-6 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl text-sm sm:text-base font-semibold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  {submitting ? "Menyimpan..." : "Lanjut ke Kuesioner Akhir (Alat Ukur)"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAHAP 7: KUESIONER AKHIR / INTI (ALAT UKUR PASCAINTERAKSI)     */}
        {/* ============================================================== */}
        {step === 7 && (
          <div className="max-w-4xl sm:max-w-5xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-sm">
            <div className="border-b border-slate-100 pb-4 mb-5 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                Alat Ukur Pascainteraksi
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
                Pilihlah tingkat persetujuan Anda terhadap setiap pernyataan di bawah ini berdasarkan pengalaman Anda berdiskusi dengan chatbot dan mengambil keputusan keuangan.
              </p>
            </div>

            {/* STICKY SCALE LEGEND (Tetap terlihat saat scroll di mobile & desktop) */}
            <div className="sticky top-16 z-20 bg-white/95 backdrop-blur-md py-3 px-4 rounded-xl border border-slate-200 shadow-sm mb-6 transition-all">
              <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-600 mb-2 px-0.5">
                <span className="flex items-center gap-2 text-slate-700 font-bold">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  Keterangan Pilihan:
                </span>
                <span className="text-xs text-slate-500 font-normal">
                  Terisi: <strong className="font-semibold text-blue-600">{Object.keys(postAnswers).length}</strong>/{POST_QUESTIONNAIRE_ITEMS.length}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5 text-center">
                <div className="py-1.5 px-1 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center justify-center">
                  <span className="text-sm sm:text-base font-bold text-slate-800">1</span>
                  <span className="text-[10px] sm:text-xs text-slate-600 font-medium leading-tight mt-0.5">Sangat Tidak Setuju</span>
                </div>
                <div className="py-1.5 px-1 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center justify-center">
                  <span className="text-sm sm:text-base font-bold text-slate-800">2</span>
                  <span className="text-[10px] sm:text-xs text-slate-600 font-medium leading-tight mt-0.5">Tidak Setuju</span>
                </div>
                <div className="py-1.5 px-1 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center justify-center">
                  <span className="text-sm sm:text-base font-bold text-slate-800">3</span>
                  <span className="text-[10px] sm:text-xs text-slate-600 font-medium leading-tight mt-0.5">Netral</span>
                </div>
                <div className="py-1.5 px-1 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center justify-center">
                  <span className="text-sm sm:text-base font-bold text-slate-800">4</span>
                  <span className="text-[10px] sm:text-xs text-slate-600 font-medium leading-tight mt-0.5">Setuju</span>
                </div>
                <div className="py-1.5 px-1 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center justify-center">
                  <span className="text-sm sm:text-base font-bold text-slate-800">5</span>
                  <span className="text-[10px] sm:text-xs text-slate-600 font-medium leading-tight mt-0.5">Sangat Setuju</span>
                </div>
              </div>
            </div>

            <form onSubmit={handlePostQuestionnaireSubmit} className="space-y-4 sm:space-y-5">
              {/* Tanpa nama variabel / kategori untuk menghindari bias */}
              {POST_QUESTIONNAIRE_ITEMS.map((item, idx) => {
                const selectedVal = postAnswers[item.code];
                return (
                  <div
                    key={item.code}
                    className={`p-4 sm:p-5 rounded-xl border transition-all ${
                      selectedVal
                        ? "bg-white border-slate-300 shadow-2xs"
                        : "bg-slate-50/70 border-slate-200"
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3.5">
                      <span className="shrink-0 w-7 h-7 rounded-full bg-slate-200 text-slate-800 text-xs sm:text-sm font-bold flex items-center justify-center mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-sm sm:text-base font-medium text-slate-900 leading-relaxed pt-0.5">
                        {item.statement}
                      </p>
                    </div>

                    {/* Tombol pilihan hanya angka agar tidak terpotong di layar HP */}
                    <div className="grid grid-cols-5 gap-2 sm:gap-3">
                      {LIKERT_OPTIONS.map((opt) => {
                        const isSelected = selectedVal === opt.value;
                        return (
                          <label
                            key={opt.value}
                            className={`py-3 sm:py-3.5 rounded-xl border text-center cursor-pointer transition-all flex items-center justify-center select-none ${
                              isSelected
                                ? "bg-blue-600 border-blue-600 text-white font-bold shadow-sm shadow-blue-500/25 scale-[1.02]"
                                : "bg-white border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-700 font-semibold"
                            }`}
                          >
                            <input
                              type="radio"
                              name={item.code}
                              value={opt.value}
                              checked={isSelected}
                              onChange={() =>
                                setPostAnswers({ ...postAnswers, [item.code]: opt.value })
                              }
                              className="sr-only"
                              required
                            />
                            <span className="text-base sm:text-lg font-bold">{opt.value}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center gap-4 pt-3">
                <button
                  type="button"
                  onClick={() => setStep(6)}
                  className="px-6 py-3.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-sm sm:text-base font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Kembali
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-4 px-6 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl text-sm sm:text-base font-bold shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? "Menyimpan Jawaban..." : "Selesaikan Penelitian & Lihat Penutup"}
                  <CheckCircle className="w-5 h-5" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAHAP 8: PENUTUP (DEBRIEFING) - PDF PAGE 10                     */}
        {/* ============================================================== */}
        {step === 8 && participant && (
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 shadow-sm text-center">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-9 h-9" />
            </div>

            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              Penutup
            </h2>

            <div className="text-sm sm:text-base text-slate-700 space-y-4 leading-relaxed mb-8 text-left">
              <p>Anda telah menyelesaikan seluruh rangkaian penelitian.</p>
              <p>
                Terima kasih telah meluangkan waktu untuk berpartisipasi dalam penelitian ini.
              </p>
              <p>
                Jawaban dan pengalaman yang Anda berikan sangat berarti bagi pelaksanaan penelitian kami. Seluruh data yang dikumpulkan akan digunakan untuk kepentingan akademis dan dijaga kerahasiaannya.
              </p>
              <p>
                Kami sangat menghargai kesediaan dan kontribusi Anda dalam mendukung penelitian ini. Semoga Anda senantiasa diberikan kesehatan dan kesuksesan dalam menjalani kehidupan.
              </p>
              <p>
                Apabila Anda memiliki pertanyaan, kritik, atau saran, silakan menghubungi kami melalui email:{" "}
                <a
                  href="mailto:alfian.firja@gmail.com"
                  className="text-blue-600 font-semibold underline"
                >
                  alfian.firja@gmail.com
                </a>
                .
              </p>
              <div className="pt-2 text-xs text-slate-500 font-medium">
                Hormat kami,
                <br />
                <strong>Alfian & Regina</strong>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left mb-6">
              <div className="text-xs text-slate-500">Kode Bukti Partisipan Anda:</div>
              <div className="font-mono font-bold text-slate-800 text-base">
                {participant.participantCode}
              </div>
            </div>

            <button
              onClick={() => router.push("/")}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition"
            >
              Kembali ke Beranda
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ExperimentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ExperimentContent />
    </Suspense>
  );
}
