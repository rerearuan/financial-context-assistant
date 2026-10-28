"use client";

import React from "react";
import {
  Wallet,
  Banknote,
  Calendar,
  Shield,
  Target,
  Coins,
  Home,
  CreditCard,
  Zap,
  ShoppingBag,
  GraduationCap,
  Info,
  Clock,
  Sparkles,
  Layers,
  AlertTriangle,
} from "lucide-react";

export interface ScenarioData {
  id?: string;
  code?: string;
  title?: string;
  actionType?: string;
  conflictLevel?: string;
  situasiText?: string;
  kondisiKeuanganText?: string;
  tugasText?: string;
  descriptionText?: string;
}

interface ScenarioViewerProps {
  scenario: ScenarioData;
  compact?: boolean;
}

export function ScenarioViewer({ scenario, compact = false }: ScenarioViewerProps) {
  const id = scenario.id || "";
  const isSpendingLow = id === "spending_low";
  const isSpendingHigh = id === "spending_high";
  const isSavingLow = id === "saving_low";
  const isSavingHigh = id === "saving_high";
  const isKnownScenario = isSpendingLow || isSpendingHigh || isSavingLow || isSavingHigh;

  return (
    <div className={`space-y-5 ${compact ? "text-xs" : "text-xs sm:text-sm"}`}>
      {/* =========================================================================
          BAGIAN 1: SITUASI & LATAR BELAKANG
      ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-slate-100">
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 text-sm">
              Situasi & Rencana Tindakan
            </h4>
            <span className="text-[11px] text-slate-500">
              Latar belakang keputusan yang sedang Anda pertimbangkan
            </span>
          </div>
        </div>

        {isKnownScenario ? (
          <div className="space-y-3.5 text-slate-700 leading-relaxed">
            {/* SPENDING SCENARIOS (Laptop) */}
            {(isSpendingLow || isSpendingHigh) && (
              <>
                <p>
                  Anda sedang mempertimbangkan untuk membeli laptop baru guna mendukung pekerjaan dan aktivitas sehari-hari. Laptop yang Anda gunakan saat ini masih dapat digunakan, namun performanya mulai menurun dan sering mengalami <em>lag</em> ketika menjalankan aplikasi pekerjaan dalam beberapa minggu terakhir.
                </p>
                <p>
                  Karena kondisi tersebut, selama beberapa bulan terakhir Anda memang telah merencanakan untuk mengganti laptop dan mulai menyisihkan uang secara berkala.
                </p>

                {isSpendingHigh && (
                  <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200/80 text-amber-900 text-xs">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Pertimbangan Tambahan:</strong> Pada saat yang sama, Anda juga sedang mempersiapkan dana untuk mengikuti <strong>program sertifikasi profesional</strong> dalam beberapa bulan ke depan guna pengembangan karier. Bagi Anda, mengganti laptop dan mengikuti program sertifikasi <strong>sama-sama merupakan tujuan yang sangat penting</strong>.
                      </div>
                    </div>
                  </div>
                )}

                {/* Promo Card & Pilihan Pembayaran */}
                <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-slate-900 text-xs">
                        Laptop Pilihan yang Ditemukan
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                      Promo Berakhir Hari Ini
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mb-3">
                    Laptop yang sesuai kebutuhan memiliki harga normal <strong>Rp8.500.000</strong> dan saat ini sedang ditawarkan dengan harga promo <strong>Rp7.000.000</strong>.
                  </p>

                  <div className="grid sm:grid-cols-2 gap-2.5">
                    {/* Opsi Tunai */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-2xs">
                      <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wide flex items-center gap-1.5 mb-1">
                        <Coins className="w-3.5 h-3.5 text-blue-600" />
                        Opsi 1: Tunai
                      </div>
                      <div className="text-sm font-extrabold text-slate-900">
                        Rp7.000.000
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Pembayaran penuh di muka hari ini
                      </p>
                    </div>

                    {/* Opsi Cicilan */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-2xs">
                      <div className="text-[11px] font-bold text-indigo-800 uppercase tracking-wide flex items-center gap-1.5 mb-1">
                        <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                        Opsi 2: Cicilan (12 Bulan)
                      </div>
                      <div className="text-sm font-extrabold text-slate-900">
                        Tenor 12 Bulan
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Bunga flat 1,2%/bulan + admin 1% dari harga
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* SAVING SCENARIOS (Dana Darurat) */}
            {(isSavingLow || isSavingHigh) && (
              <>
                <p>
                  Anda baru saja menerima pendapatan bulanan dan ingin mengevaluasi bagaimana pendapatan tersebut sebaiknya dialokasikan pada bulan ini.
                </p>
                <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200/80 text-blue-950 text-xs">
                  <div className="flex items-start gap-2">
                    <Target className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Tujuan Finansial Utama:</strong> Meningkatkan <strong>Dana Darurat</strong> agar kondisi keuangan Anda lebih siap dan tangguh menghadapi pengeluaran tidak terduga di masa depan.
                    </div>
                  </div>
                </div>

                {isSavingLow && (
                  <p className="text-slate-600 text-xs">
                    Pada periode ini, tidak terdapat tujuan finansial besar lain yang secara khusus sedang Anda kejar.
                  </p>
                )}

                {isSavingHigh && (
                  <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200/80 text-amber-900 text-xs">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Dilema Alokasi Finansial:</strong> Namun, pada saat yang sama Anda juga masih mempersiapkan dana untuk mengikuti <strong>program sertifikasi profesional</strong> dalam beberapa bulan ke depan. Bagi Anda, meningkatkan Dana Darurat dan mengikuti sertifikasi <strong>sama-sama merupakan tujuan yang sangat penting</strong>.
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* Fallback text generic */
          <div className="whitespace-pre-line text-slate-700 leading-relaxed">
            {scenario.situasiText || scenario.descriptionText}
          </div>
        )}
      </div>

      {/* =========================================================================
          BAGIAN 2: KONDISI KEUANGAN ANDA
      ========================================================================= */}
      <div className="bg-slate-50/80 rounded-xl border border-slate-200 p-4 sm:p-5">
        <div className="flex items-center gap-2 pb-2.5 mb-4 border-b border-slate-200">
          <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 text-sm">
              Kondisi Keuangan Anda
            </h4>
            <span className="text-[11px] text-slate-500">
              Informasi saldo, alokasi dana, dan kewajiban pembayaran saat ini
            </span>
          </div>
        </div>

        {isKnownScenario ? (
          <div className="space-y-4">
            {/* 1. Ringkasan Saldo & Pendapatan (Stat Grid) */}
            <div>
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-slate-500" />
                1. Saldo & Arus Kas Masuk
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Saldo Rekening */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] text-slate-500 block font-medium">
                    Saldo Rekening Saat Ini
                  </span>
                  <div className="text-base font-extrabold text-slate-900 mt-0.5">
                    {isSavingLow ? "Rp16.000.000" : "Rp18.000.000"}
                  </div>
                  <span className="text-[10px] text-slate-400">Total kas di rekening</span>
                </div>

                {/* Pendapatan Bulanan */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] text-slate-500 block font-medium">
                    Pendapatan Bulanan
                  </span>
                  <div className="text-base font-extrabold text-emerald-700 mt-0.5">
                    Rp8.000.000
                  </div>
                  <span className="text-[10px] text-slate-400">Pemasukan rutin bulanan</span>
                </div>

                {/* Siklus Pendapatan */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] text-slate-500 block font-medium flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    Siklus Pendapatan
                  </span>
                  <div className="text-xs font-bold text-slate-800 mt-1">
                    {isSpendingLow || isSpendingHigh
                      ? "Diterima dalam 12 hari"
                      : "Diterima hari ini"}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {isSpendingLow || isSpendingHigh
                      ? "Gaji berikutnya: ~12 hari lagi"
                      : "Gaji berikutnya: ~30 hari lagi"}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Alokasi / Komposisi Saldo Rekening */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-blue-600" />
                  2. Alokasi dari Total Saldo Rekening
                </span>
                <span className="text-[11px] font-normal text-slate-500">
                  Total: {isSavingLow ? "Rp16.000.000" : "Rp18.000.000"}
                </span>
              </div>

              <div className="space-y-2">
                {/* Dana Darurat */}
                <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                      <span className="font-semibold text-slate-900 text-xs">
                        Dana Darurat
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {isSavingLow || isSavingHigh ? (
                        <>
                          Telah terkumpul <strong>Rp8.000.000</strong> (Target: <strong>Rp12.000.000</strong> • Kekurangan: <span className="font-semibold text-rose-600">Rp4.000.000</span>)
                        </>
                      ) : (
                        <>
                          Telah terkumpul <strong>Rp5.000.000</strong> (dana darurat yang ingin Anda pertahankan)
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-blue-900 block">
                      {isSavingLow || isSavingHigh ? "Rp8.000.000" : "Rp5.000.000"}
                    </span>
                    {(isSavingLow || isSavingHigh) && (
                      <span className="text-[10px] text-blue-700 font-medium">
                        66,7% dari target
                      </span>
                    )}
                  </div>
                </div>

                {/* Dana Khusus / Tabungan Tertentu */}
                {isSpendingLow && (
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="font-semibold text-slate-900 text-xs">
                          Dana Pembelian Laptop
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Dana yang selama beberapa bulan terakhir telah Anda sisihkan khusus untuk laptop
                      </p>
                    </div>
                    <span className="text-xs font-bold text-slate-900 shrink-0">
                      Rp6.000.000
                    </span>
                  </div>
                )}

                {isSpendingHigh && (
                  <>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="font-semibold text-slate-900 text-xs">
                            Dana Pembelian Laptop
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Dana yang telah disisihkan khusus untuk pembelian laptop
                        </p>
                      </div>
                      <span className="text-xs font-bold text-slate-900 shrink-0">
                        Rp3.000.000
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <GraduationCap className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span className="font-semibold text-slate-900 text-xs">
                            Dana Sertifikasi Profesional
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Dana yang telah disisihkan untuk program sertifikasi mendatang
                        </p>
                      </div>
                      <span className="text-xs font-bold text-slate-900 shrink-0">
                        Rp3.000.000
                      </span>
                    </div>
                  </>
                )}

                {isSavingHigh && (
                  <div className="p-2.5 rounded-lg bg-purple-50/50 border border-purple-100 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                        <span className="font-semibold text-slate-900 text-xs">
                          Dana Sertifikasi Profesional
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Dana yang telah disisihkan sebelumnya untuk mengikuti sertifikasi
                      </p>
                    </div>
                    <span className="text-xs font-bold text-purple-900 shrink-0">
                      Rp2.000.000
                    </span>
                  </div>
                )}

                {/* Sisa Dana Bulan Berjalan / Kas Bebas */}
                <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span className="font-semibold text-slate-900 text-xs">
                        Dana Tersedia Bulan Berjalan
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {isSavingLow || isSavingHigh
                        ? "Pendapatan baru diterima dan tersedia untuk dialokasikan (belum digunakan)"
                        : "Saldo yang masih tersedia saat ini untuk kebutuhan bulan berjalan"}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-emerald-800 shrink-0">
                    {isSavingLow || isSavingHigh ? "Rp8.000.000" : "Rp7.000.000"}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Kewajiban Pembayaran & Pengeluaran Rutin */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-rose-600" />
                3. Kewajiban Pembayaran & Pengeluaran Rutin
              </div>

              <div className="space-y-2">
                {/* Skenario Saving: Tempat tinggal, tagihan kartu/BNPL, utilitas, kebutuhan sehari-hari */}
                {(isSavingLow || isSavingHigh) && (
                  <>
                    {/* Tempat Tinggal */}
                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition border border-slate-100">
                      <div className="flex items-center gap-2">
                        <Home className="w-4 h-4 text-slate-500 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-900 text-xs">
                            Biaya Tempat Tinggal
                          </div>
                          <span className="text-[10px] text-slate-500">
                            Sewa / tempat tinggal
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-900">
                          Rp2.400.000
                        </div>
                        <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
                          Jatuh tempo 9 hari
                        </span>
                      </div>
                    </div>

                    {/* Tagihan Kartu / BNPL */}
                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition border border-slate-100">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-slate-500 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-900 text-xs">
                            Tagihan Kartu Kredit / BNPL
                          </div>
                          <span className="text-[10px] text-slate-500">
                            Cicilan & tagihan tertunda
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-900">
                          Rp600.000
                        </div>
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                          Jatuh tempo 6 hari
                        </span>
                      </div>
                    </div>

                    {/* Utilitas */}
                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition border border-slate-100">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-900 text-xs">
                            Tagihan Utilitas Bulan Ini
                          </div>
                          <span className="text-[10px] text-slate-500">
                            Listrik, air, dan internet (estimasi)
                          </span>
                        </div>
                      </div>
                      <div className="text-xs font-bold text-slate-900">
                        Rp400.000 – Rp600.000
                      </div>
                    </div>

                    {/* Pengeluaran Rutin Sehari-hari */}
                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition border border-slate-100">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4 text-slate-500 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-900 text-xs">
                            Kebutuhan Sehari-hari (3 Bulan Terakhir)
                          </div>
                          <span className="text-[10px] text-slate-500">
                            Di luar tempat tinggal, tagihan kartu & utilitas
                          </span>
                        </div>
                      </div>
                      <div className="text-xs font-bold text-slate-900">
                        Rp2.400.000 – Rp3.000.000 / bln
                      </div>
                    </div>
                  </>
                )}

                {/* Skenario Spending: Tagihan jatuh tempo 6 hari, pemakaian berjalan, rata-rata bulanan */}
                {(isSpendingLow || isSpendingHigh) && (
                  <>
                    {/* Tagihan Jatuh Tempo */}
                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition border border-slate-100">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-slate-500 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-900 text-xs">
                            Tagihan Mendatang
                          </div>
                          <span className="text-[10px] text-slate-500">
                            Kewajiban pembayaran terdekat
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-900">
                          Rp1.800.000
                        </div>
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                          Jatuh tempo 6 hari
                        </span>
                      </div>
                    </div>

                    {/* Pengeluaran Rutin Berjalan */}
                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition border border-slate-100">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-900 text-xs">
                            Pengeluaran Rutin Terpakai (Bulan Berjalan)
                          </div>
                          <span className="text-[10px] text-slate-500">
                            Realisasi pengeluaran harian hingga hari ini
                          </span>
                        </div>
                      </div>
                      <div className="text-xs font-bold text-slate-900">
                        ~Rp2.400.000
                      </div>
                    </div>

                    {/* Rata-rata 3 Bulan Terakhir */}
                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition border border-slate-100">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4 text-slate-500 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-900 text-xs">
                            Kebutuhan Rutin Normal (3 Bulan Terakhir)
                          </div>
                          <span className="text-[10px] text-slate-500">
                            Di luar tagihan khusus
                          </span>
                        </div>
                      </div>
                      <div className="text-xs font-bold text-slate-900">
                        Rp3.800.000 – Rp4.600.000 / bln
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 4. Rencana Finansial Mendatang (Jika Ada Sertifikasi) */}
            {(isSpendingHigh || isSavingHigh) && (
              <div className="bg-purple-50/60 p-3.5 rounded-xl border border-purple-200/80">
                <div className="text-[11px] font-bold text-purple-900 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-purple-700" />
                  4. Rencana Program Sertifikasi Profesional
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-slate-700">Estimasi Biaya: </span>
                    <strong className="text-purple-950 font-bold">
                      Rp4.000.000 – Rp4.500.000
                    </strong>
                  </div>
                  <div className="text-[11px] font-medium text-purple-800 bg-white/80 border border-purple-200 px-2 py-0.5 rounded-md">
                    Target Pelaksanaan: <strong>2–3 bulan lagi</strong>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Catatan Ketentuan Tambahan */}
            <div className="p-3 rounded-lg bg-slate-100/70 border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                <Info className="w-3.5 h-3.5 text-slate-500" />
                Catatan Kondisi Tambahan:
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600 pl-1">
                <li>
                  Tidak terdapat kewajiban pembayaran besar lain yang telah diketahui pada bulan ini.
                </li>
                <li>
                  Tidak terdapat sumber pendapatan tambahan yang telah dipastikan sebelum pendapatan berikutnya diterima.
                </li>
              </ul>
            </div>
          </div>
        ) : (
          /* Fallback generic structured bullet list */
          <div className="whitespace-pre-line text-slate-700 leading-relaxed font-normal">
            {scenario.kondisiKeuanganText}
          </div>
        )}
      </div>
    </div>
  );
}
