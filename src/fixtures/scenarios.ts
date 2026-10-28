import rawDataset from "./synthetic_bank_scenarios.json";
import {
  BankTransactionItem,
  FinancialAction,
  FinancialProfileContext,
  LiabilityItem,
} from "../lib/financial-engine/types";

export interface ScenarioPackage {
  scenario: {
    id: string;
    code: string;
    title: string;
    actionType: "spending" | "saving";
    conflictLevel: "low" | "high";
    h0Date: string;
    situasiText: string;
    kondisiKeuanganText: string;
    tugasText: string;
    descriptionText: string;
    initialAction: FinancialAction;
    actionOptions?: Array<number | string>;
    initialAssistantMessage: string;
    quickReplies: string[];
    tugasQuestions: Array<{
      id: string;
      question: string;
      options?: string[];
      type: "radio" | "text";
    }>;
  };
  syntheticProfile: FinancialProfileContext;
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

// Find raw profile by id helper
function getRaw(id: string) {
  return rawDataset.scenarios.find((s: any) => s.scenario_id === id);
}

const rawSpendLow = getRaw("spending_low");
const rawSpendHigh = getRaw("spending_high");
const rawSaveLow = getRaw("saving_low");
const rawSaveHigh = getRaw("saving_high");

export const SCENARIO_PACKAGES: ScenarioPackage[] = [
  // =========================================================================
  // 1. Spending – Low MAC (Pembelian Laptop)
  // =========================================================================
  {
    scenario: {
      id: "spending_low",
      code: "SCN-SPEND-LOW",
      title: "Pertimbangan Pembelian Laptop",
      actionType: "spending",
      conflictLevel: "low",
      h0Date: "2026-10-20",
      situasiText: `Anda sedang mempertimbangkan untuk membeli laptop baru untuk mendukung pekerjaan dan aktivitas sehari-hari.

Laptop yang Anda gunakan saat ini masih dapat digunakan, tetapi performanya mulai menurun. Dalam beberapa minggu terakhir, laptop tersebut beberapa kali mengalami lag ketika menjalankan aplikasi yang Anda gunakan untuk bekerja dan beraktivitas sehari-hari.

Karena kondisi tersebut, selama beberapa bulan terakhir Anda memang telah merencanakan untuk mengganti laptop dan mulai menyisihkan uang untuk kebutuhan tersebut.

Anda menemukan laptop yang sesuai dengan kebutuhan dengan harga normal Rp8.500.000. Saat ini laptop tersebut sedang ditawarkan dengan harga promo Rp7.000.000 (promosi hanya berlaku sampai hari ini).

Tersedia dua metode pembayaran:
● Tunai: Rp7.000.000 (dibayar lunas hari ini)
● Cicilan: Tenor 12 bulan, bunga flat 1,2% per bulan, serta biaya administrasi 1% dari harga barang`,
      kondisiKeuanganText: `1. Saldo & Arus Kas Masuk:
● Saldo rekening Anda saat ini (per 20 Okt 2026): Rp18.000.000.
● Pendapatan bulanan: Rp8.000.000.
● Pendapatan berikutnya diperkirakan diterima dalam 12 hari (1 Nov 2026).

2. Alokasi dari Total Saldo Rekening (Rp18.000.000):
  ○ Rp5.000.000 merupakan Dana Darurat yang ingin Anda pertahankan.
  ○ Rp6.000.000 merupakan dana yang selama beberapa bulan terakhir Anda sisihkan khusus untuk pembelian laptop (kekurangan Rp1.000.000 terhadap harga promo Rp7.000.000).
  ○ Rp7.000.000 merupakan saldo yang masih tersedia saat ini untuk kebutuhan bulan berjalan.

3. Kewajiban & Pengeluaran Rutin:
● Pengeluaran rutin harian yang telah terpakai selama bulan berjalan (1–20 Okt): Rp2.400.000.
● Rata-rata pengeluaran rutin 3 bulan terakhir (Juli–Sept): berkisar antara Rp3.800.000–Rp4.600.000 per bulan (di luar tagihan khusus).
● Tagihan mendatang yang harus dibayar: Rp1.800.000 (jatuh tempo 26 Okt 2026, 6 hari ke depan).

4. Catatan Tambahan:
● Tidak terdapat pembayaran besar lain yang telah diketahui hingga pendapatan berikutnya diterima.`,
      tugasText: `Gunakan chatbot yang tersedia untuk membantu Anda mempertimbangkan keputusan Pembelian Laptop.`,
      descriptionText: `Pertimbangan pembelian laptop baru seharga Rp7.000.000 dengan opsi tunai atau cicilan 12 bulan.`,
      initialAction: {
        type: "spending",
        amount: 7000000,
        timing: "Hari ini (Promo terbatas)",
        targetCategory: "Pembelian Laptop",
        description: "Pertimbangan pembelian laptop baru seharga Rp7.000.000",
        source: "scenario",
        paymentMethod: "cash",
      },
      actionOptions: ["cash", "installment"],
      initialAssistantMessage: `Halo, saya akan membantu Anda mempertimbangkan keputusan dalam simulasi ini. Silakan sampaikan apa yang ingin Anda diskusikan mengenai rencana pembelian laptop seharga Rp 7.000.000 ini.`,
      quickReplies: [
        "Apa dampaknya jika saya beli tunai Rp 7.000.000 hari ini?",
        "Bagaimana jika saya memilih opsi cicilan 12 bulan?",
        "Apakah sisa kas cukup untuk tagihan dan kebutuhan sebelum gajian?",
        "Bagaimana jika mencari laptop yang lebih murah?",
      ],
      tugasQuestions: [
        {
          id: "q1",
          question: "Setelah berdiskusi dengan chatbot, apakah Anda akan melakukan pembelian tersebut?",
          options: ["Ya", "Tidak"],
          type: "radio",
        },
        {
          id: "q2",
          question: "Jika Ya, metode pembayaran apa yang Anda gunakan? mengapa?",
          options: ["Tunai", "Cicilan"],
          type: "radio",
        },
        {
          id: "q3",
          question: "Jelaskan alasan keputusan Anda!",
          type: "text",
        },
      ],
    },
    syntheticProfile: {
      id: "prof_spend_low",
      scenarioId: "spending_low",
      h0Date: "2026-10-20",
      totalCashBalance: 18000000,
      liquidBalance: 7000000,
      allocations: {
        emergency: 5000000,
        laptop: 6000000,
        operating: 7000000,
      },
      budgets: [
        {
          category: "Dana Alokasi Laptop",
          allocated: 6000000,
          spentSoFar: 0,
          remaining: 6000000,
          source: "synthetic_profile",
        },
        {
          category: "Kebutuhan Bulan Berjalan",
          allocated: 7000000,
          spentSoFar: 2400000,
          remaining: 4600000,
          source: "synthetic_profile",
        },
      ],
      liabilities: [
        {
          id: "special_bill",
          title: "Tagihan Khusus Bulanan",
          amount: 1800000,
          dueDate: "2026-10-26", // 6 hari dari H0 (2026-10-20)
          isPriority: true,
          status: "unpaid",
          source: "synthetic_profile",
        },
      ],
      goals: [
        {
          id: "laptop_goal",
          title: "Pembelian Laptop",
          targetAmount: 7000000,
          currentAllocated: 6000000,
          priority: "high",
          lockIn: false,
          source: "synthetic_profile",
        },
      ],
      buffer: {
        name: "Batas Minimum Dana Darurat",
        minAmount: 5000000,
        currentAmount: 5000000,
        source: "synthetic_profile",
      },
      routineExpenses: {
        monthlyEstimate: 4200000,
        spentSoFar: 2400000,
        remainingEstimate: 1800000,
        range: { min: 1400000, max: 2200000 },
        source: "synthetic_profile",
      },
      incomeSchedule: {
        sourceName: "Pendapatan Bulanan",
        amount: 8000000,
        nextDate: "2026-11-01", // 12 hari dari H0
        regularity: "Bulanan",
        source: "synthetic_profile",
      },
      historyMonths: ["2026-07", "2026-08", "2026-09"],
      routineMonthlyTotals: [3800000, 4200000, 4600000],
      laptopOffer: {
        price: 7000000,
        regularPrice: 8500000,
        installmentMonths: 12,
        flatInterestMonthly: 0.012,
        adminRate: 0.01,
        firstPaymentDate: null,
        adminPaymentDate: null,
      },
      transactions: (rawSpendLow?.transactions || []) as unknown as BankTransactionItem[],
      source: "synthetic_profile",
    },
    expectedCalculations: {
      balanceAfterAction: 11000000, // 18jt - 7jt
      budgetVariance: -1000000, // Alokasi laptop 6jt - 7jt = kurang 1jt (tertutup dari kas berjalan 7jt)
      liabilitiesDueBeforeIncome: 1800000, // Tagihan 1.8jt jatuh tempo 26 Okt sebelum gaji 1 Nov
      remainingCashAfterImmediateObligations: 9200000, // 11jt - 1.8jt
      isLiquidityThreatened: false,
      isBudgetExceeded: true,
      deficitAmount: 0,
    },
  },

  // =========================================================================
  // 2. Spending – High MAC (Pembelian Laptop vs Sertifikasi)
  // =========================================================================
  {
    scenario: {
      id: "spending_high",
      code: "SCN-SPEND-HIGH",
      title: "Pertimbangan Pembelian Laptop",
      actionType: "spending",
      conflictLevel: "high",
      h0Date: "2026-10-20",
      situasiText: `Anda sedang mempertimbangkan untuk membeli laptop baru untuk mendukung pekerjaan dan aktivitas sehari-hari.

Laptop yang Anda gunakan saat ini masih dapat digunakan, tetapi performanya mulai menurun. Dalam beberapa minggu terakhir, laptop tersebut beberapa kali mengalami lag ketika menjalankan aplikasi yang Anda gunakan untuk bekerja dan beraktivitas sehari-hari.

Karena kondisi tersebut, selama beberapa bulan terakhir Anda telah merencanakan untuk mengganti laptop dan mulai menyisihkan uang untuk kebutuhan tersebut.

Pada saat yang sama, Anda juga sedang mempersiapkan dana untuk mengikuti program sertifikasi profesional yang ingin Anda ambil dalam beberapa bulan ke depan. Program tersebut menurut Anda penting karena dapat mendukung pengembangan kemampuan dan karier Anda.

Bagi Anda, mengganti laptop dan mengikuti program sertifikasi sama-sama merupakan tujuan yang sangat penting.

Anda menemukan laptop yang sesuai dengan kebutuhan dengan harga normal Rp8.500.000. Saat ini laptop tersebut sedang ditawarkan dengan harga promo Rp7.000.000 (promosi hanya berlaku sampai hari ini).

Tersedia dua metode pembayaran:
● Tunai: Rp7.000.000 (dibayar lunas hari ini)
● Cicilan: Tenor 12 bulan, bunga flat 1,2% per bulan, serta biaya administrasi 1% dari harga barang`,
      kondisiKeuanganText: `1. Saldo & Arus Kas Masuk:
● Saldo rekening Anda saat ini (per 20 Okt 2026): Rp18.000.000.
● Pendapatan bulanan: Rp8.000.000.
● Pendapatan berikutnya diperkirakan diterima dalam 12 hari (1 Nov 2026).

2. Alokasi dari Total Saldo Rekening (Rp18.000.000):
  ○ Rp5.000.000 merupakan Dana Darurat yang ingin Anda pertahankan.
  ○ Rp3.000.000 merupakan dana yang disisihkan khusus untuk pembelian laptop (kekurangan Rp4.000.000 terhadap harga promo Rp7.000.000).
  ○ Rp3.000.000 merupakan dana yang disisihkan untuk program sertifikasi profesional.
  ○ Rp7.000.000 merupakan saldo yang masih tersedia saat ini untuk kebutuhan bulan berjalan.

3. Rencana Finansial Mendatang:
● Biaya program sertifikasi profesional: diperkirakan sebesar Rp4.000.000–Rp4.500.000.
● Rencana pelaksanaan sertifikasi: sekitar 2–3 bulan lagi.

4. Kewajiban & Pengeluaran Rutin:
● Pengeluaran rutin harian yang telah terpakai selama bulan berjalan (1–20 Okt): Rp2.400.000.
● Rata-rata pengeluaran rutin 3 bulan terakhir (Juli–Sept): berkisar antara Rp3.800.000–Rp4.600.000 per bulan (di luar tagihan khusus).
● Tagihan mendatang yang harus dibayar: Rp1.800.000 (jatuh tempo 26 Okt 2026, 6 hari ke depan).

5. Catatan Tambahan:
● Tidak terdapat pembayaran besar lain yang telah diketahui hingga pendapatan berikutnya diterima.`,
      tugasText: `Gunakan chatbot yang tersedia untuk membantu Anda mempertimbangkan keputusan Pembelian Laptop.`,
      descriptionText: `Pertimbangan pembelian laptop baru seharga Rp7.000.000 dengan opsi tunai atau cicilan 12 bulan.`,
      initialAction: {
        type: "spending",
        amount: 7000000,
        timing: "Hari ini (Promo terbatas)",
        targetCategory: "Pembelian Laptop",
        description: "Pertimbangan pembelian laptop baru seharga Rp7.000.000",
        source: "scenario",
        paymentMethod: "cash",
      },
      actionOptions: ["cash", "installment"],
      initialAssistantMessage: `Halo, saya akan membantu Anda mempertimbangkan keputusan dalam simulasi ini. Silakan sampaikan apa yang ingin Anda diskusikan mengenai rencana pembelian laptop seharga Rp 7.000.000 ini.`,
      quickReplies: [
        "Apa dampaknya jika saya beli tunai Rp 7.000.000 hari ini?",
        "Bagaimana pengaruhnya terhadap pos dana sertifikasi saya?",
        "Bagaimana jika saya memilih opsi cicilan 12 bulan?",
        "Apakah kas operasional cukup untuk tagihan dan kebutuhan harian?",
      ],
      tugasQuestions: [
        {
          id: "q1",
          question: "Setelah berdiskusi dengan chatbot, apakah Anda akan melakukan pembelian tersebut?",
          options: ["Ya", "Tidak"],
          type: "radio",
        },
        {
          id: "q2",
          question: "Jika Ya, metode pembayaran apa yang Anda gunakan? mengapa?",
          options: ["Tunai", "Cicilan"],
          type: "radio",
        },
        {
          id: "q3",
          question: "Jelaskan alasan keputusan Anda!",
          type: "text",
        },
      ],
    },
    syntheticProfile: {
      id: "prof_spend_high",
      scenarioId: "spending_high",
      h0Date: "2026-10-20",
      totalCashBalance: 18000000,
      liquidBalance: 7000000,
      allocations: {
        emergency: 5000000,
        laptop: 3000000,
        certification: 3000000,
        operating: 7000000,
      },
      budgets: [
        {
          category: "Dana Alokasi Laptop",
          allocated: 3000000,
          spentSoFar: 0,
          remaining: 3000000,
          source: "synthetic_profile",
        },
        {
          category: "Kebutuhan Bulan Berjalan",
          allocated: 7000000,
          spentSoFar: 2400000,
          remaining: 4600000,
          source: "synthetic_profile",
        },
      ],
      liabilities: [
        {
          id: "special_bill",
          title: "Tagihan Khusus Bulanan",
          amount: 1800000,
          dueDate: "2026-10-26", // 6 hari dari H0
          isPriority: true,
          status: "unpaid",
          source: "synthetic_profile",
        },
      ],
      goals: [
        {
          id: "cert_goal",
          title: "Program Sertifikasi Profesional",
          targetAmount: 4500000,
          currentAllocated: 3000000,
          targetDate: "2027-01-15",
          priority: "high",
          lockIn: false,
          source: "synthetic_profile",
        },
        {
          id: "laptop_goal",
          title: "Pembelian Laptop",
          targetAmount: 7000000,
          currentAllocated: 3000000,
          priority: "high",
          lockIn: false,
          source: "synthetic_profile",
        },
      ],
      buffer: {
        name: "Batas Minimum Dana Darurat",
        minAmount: 5000000,
        currentAmount: 5000000,
        source: "synthetic_profile",
      },
      routineExpenses: {
        monthlyEstimate: 4200000,
        spentSoFar: 2400000,
        remainingEstimate: 1800000,
        range: { min: 1400000, max: 2200000 },
        source: "synthetic_profile",
      },
      incomeSchedule: {
        sourceName: "Pendapatan Bulanan",
        amount: 8000000,
        nextDate: "2026-11-01", // 12 hari dari H0
        regularity: "Bulanan",
        source: "synthetic_profile",
      },
      historyMonths: ["2026-07", "2026-08", "2026-09"],
      routineMonthlyTotals: [3800000, 4200000, 4600000],
      laptopOffer: {
        price: 7000000,
        regularPrice: 8500000,
        installmentMonths: 12,
        flatInterestMonthly: 0.012,
        adminRate: 0.01,
        firstPaymentDate: null,
        adminPaymentDate: null,
      },
      certificationGoal: {
        costMin: 4000000,
        costMax: 4500000,
        horizonMonths: [2, 3],
      },
      transactions: (rawSpendHigh?.transactions || []) as unknown as BankTransactionItem[],
      source: "synthetic_profile",
    },
    expectedCalculations: {
      balanceAfterAction: 11000000,
      budgetVariance: -4000000, // Defisit pos alokasi laptop 4jt
      liabilitiesDueBeforeIncome: 1800000,
      remainingCashAfterImmediateObligations: 9200000,
      isLiquidityThreatened: false,
      isBudgetExceeded: true,
      deficitAmount: 0,
    },
  },

  // =========================================================================
  // 3. Saving – Low MAC (Menabung Dana Darurat)
  // =========================================================================
  {
    scenario: {
      id: "saving_low",
      code: "SCN-SAVE-LOW",
      title: "Pertimbangan Alokasi Tabungan",
      actionType: "saving",
      conflictLevel: "low",
      h0Date: "2026-11-01",
      situasiText: `Anda ingin mengevaluasi bagaimana pendapatan bulanan sebaiknya dialokasikan.

Anda baru menerima pendapatan bulanan dan salah satu tujuan finansial yang sedang Anda prioritaskan adalah meningkatkan Dana Darurat. Anda ingin memperkuat Dana Darurat agar lebih siap menghadapi pengeluaran tidak terduga.

Pada periode ini, tidak terdapat tujuan finansial besar lain yang secara khusus sedang Anda kejar.`,
      kondisiKeuanganText: `1. Saldo & Arus Kas Masuk:
● Saldo rekening Anda saat ini (per 1 Nov 2026 setelah gaji masuk): Rp16.000.000.
● Pendapatan bulanan: Rp8.000.000 (baru diterima hari ini, belum digunakan).
● Pendapatan berikutnya: diperkirakan diterima sekitar 30 hari lagi (1 Des 2026).

2. Alokasi dari Total Saldo Rekening (Rp16.000.000):
  ○ Rp8.000.000 merupakan Dana Darurat yang telah dikumpulkan sebelumnya (Target: Rp12.000.000 • Kekurangan: Rp4.000.000).
  ○ Rp8.000.000 merupakan pendapatan yang baru diterima dan tersedia untuk dialokasikan pada bulan berjalan (belum digunakan untuk kebutuhan/kewajiban).

3. Kewajiban Pembayaran & Pengeluaran Rutin:
● Biaya sewa tempat tinggal: Rp2.400.000 (harus dibayar 10 Nov 2026, 9 hari lagi).
● Tagihan kartu kredit / BNPL: Rp600.000 (harus dibayar 7 Nov 2026, 6 hari lagi).
● Tagihan utilitas bulan ini: diperkirakan sebesar Rp400.000–Rp600.000 (status estimasi).
● Kebutuhan hidup sehari-hari: rata-rata 3 bulan terakhir (Agustus–Okt) berkisar antara Rp2.400.000–Rp3.000.000 per bulan (di luar tempat tinggal, kartu, dan utilitas).

4. Catatan Tambahan:
● Tidak terdapat pembayaran besar lain yang telah diketahui pada bulan ini.
● Tidak terdapat sumber pendapatan tambahan yang telah dipastikan sebelum pendapatan berikutnya diterima.`,
      tugasText: `Gunakan chatbot yang tersedia untuk membantu Anda menentukan bagaimana pendapatan bulan ini sebaiknya dialokasikan.`,
      descriptionText: `Pertimbangan alokasi penambahan tabungan dana darurat dari pendapatan bulanan.`,
      initialAction: {
        type: "saving",
        amount: 2000000,
        timing: "Bulan ini",
        targetCategory: "Penambahan Tabungan Dana Darurat",
        description: "Penyisihan tabungan ke Dana Darurat sebesar Rp 2.000.000 dari pendapatan",
        source: "scenario",
      },
      actionOptions: [1000000, 2000000, 3000000],
      initialAssistantMessage: `Halo! Saya siap mendampingi Anda mengevaluasi alokasi pendapatan bulan ini, termasuk opsi penambahan tabungan ke Dana Darurat (misalnya Rp 1.000.000, Rp 2.000.000, atau Rp 3.000.000) sebelum Anda mengambil keputusan. Apa yang ingin Anda diskusikan terlebih dahulu?`,
      quickReplies: [
        "Bagaimana jika saya menyisihkan Rp 2.000.000?",
        "Bagaimana jika saya menyisihkan Rp 1.000.000?",
        "Berapa sisa kas setelah melunasi tagihan wajib?",
        "Apakah sisa dana cukup untuk kebutuhan rutin sebulan?",
      ],
      tugasQuestions: [
        {
          id: "q1",
          question: "Setelah berdiskusi dengan chatbot, apakah Anda akan menambah Dana Darurat dari pendapatan bulan ini?",
          options: ["Ya", "Tidak"],
          type: "radio",
        },
        {
          id: "q2",
          question: "Jika Ya, berapa jumlah yang akan Anda tambahkan?",
          options: ["Rp1.000.000", "Rp2.000.000", "Rp3.000.000", "Jumlah lainnya"],
          type: "radio",
        },
        {
          id: "q3",
          question: "Jelaskan alasan keputusan Anda!",
          type: "text",
        },
      ],
    },
    syntheticProfile: {
      id: "prof_save_low",
      scenarioId: "saving_low",
      h0Date: "2026-11-01",
      totalCashBalance: 16000000,
      liquidBalance: 8000000,
      allocations: {
        emergency: 8000000,
        operating: 8000000,
      },
      budgets: [
        {
          category: "Pendapatan Tersedia Bulan Berjalan",
          allocated: 8000000,
          spentSoFar: 0,
          remaining: 8000000,
          source: "synthetic_profile",
        },
      ],
      liabilities: [
        {
          id: "card",
          title: "Tagihan Kartu Kredit/BNPL",
          amount: 600000,
          dueDate: "2026-11-07", // 6 hari dari H0
          isPriority: true,
          status: "unpaid",
          source: "synthetic_profile",
        },
        {
          id: "rent",
          title: "Biaya Sewa Tempat Tinggal",
          amount: 2400000,
          dueDate: "2026-11-10", // 9 hari dari H0
          isPriority: true,
          status: "unpaid",
          source: "synthetic_profile",
        },
        {
          id: "utilities",
          title: "Tagihan Utilitas Bulan Ini",
          amount: 500000, // Titik tengah estimasi
          amountMin: 400000,
          amountMax: 600000,
          dueDate: null, // Status estimasi, tidak ada tanggal jatuh tempo pasti
          isPriority: true,
          status: "estimated",
          period: "2026-11",
          source: "synthetic_profile",
        },
      ],
      goals: [
        {
          id: "emergency_goal",
          title: "Target Dana Darurat",
          targetAmount: 12000000,
          currentAllocated: 8000000,
          priority: "high",
          lockIn: false,
          source: "synthetic_profile",
        },
      ],
      buffer: {
        name: "Cadangan Kas Operasional",
        minAmount: 0,
        currentAmount: 8000000,
        source: "synthetic_profile",
      },
      routineExpenses: {
        monthlyEstimate: 2700000, // Tengah dari 2.4jt–3jt
        spentSoFar: 0,
        remainingEstimate: 2700000,
        range: { min: 2400000, max: 3000000 },
        source: "synthetic_profile",
      },
      incomeSchedule: {
        sourceName: "Pendapatan Bulanan Berikutnya",
        amount: 8000000,
        nextDate: "2026-12-01", // 30 hari dari H0
        regularity: "Bulanan",
        source: "synthetic_profile",
      },
      historyMonths: ["2026-08", "2026-09", "2026-10"],
      routineMonthlyTotals: [2400000, 2700000, 3000000],
      emergencyTarget: 12000000,
      transactions: (rawSaveLow?.transactions || []) as unknown as BankTransactionItem[],
      source: "synthetic_profile",
    },
    expectedCalculations: {
      balanceAfterAction: 16000000, // Saldo bank tetap 16jt karena alokasi virtual
      budgetVariance: 6000000, // 8jt kas pendapatan - 2jt tabungan = sisa 6jt kas operasional
      liabilitiesDueBeforeIncome: 3500000, // 600k + 2.4jt + 500k utilitas tengah
      remainingCashAfterImmediateObligations: 2500000, // 6jt - 3.5jt
      isLiquidityThreatened: false,
      isBudgetExceeded: false,
      deficitAmount: 0,
    },
  },

  // =========================================================================
  // 4. Saving – High MAC (Menabung Dana Darurat vs Sertifikasi)
  // =========================================================================
  {
    scenario: {
      id: "saving_high",
      code: "SCN-SAVE-HIGH",
      title: "Pertimbangan Alokasi Tabungan",
      actionType: "saving",
      conflictLevel: "high",
      h0Date: "2026-11-01",
      situasiText: `Anda ingin mengevaluasi bagaimana pendapatan bulanan sebaiknya dialokasikan.

Anda baru menerima pendapatan bulanan dan salah satu tujuan finansial yang ingin Anda capai adalah meningkatkan Dana Darurat agar lebih siap menghadapi kebutuhan tidak terduga.

Namun, pada saat yang sama, Anda juga masih mempersiapkan dana untuk mengikuti program sertifikasi profesional dalam beberapa bulan ke depan.

Bagi Anda, meningkatkan Dana Darurat dan mengikuti program sertifikasi sama-sama merupakan tujuan yang sangat penting.`,
      kondisiKeuanganText: `1. Saldo & Arus Kas Masuk:
● Saldo rekening Anda saat ini (per 1 Nov 2026 setelah gaji masuk): Rp18.000.000.
● Pendapatan bulanan: Rp8.000.000 (baru diterima hari ini, belum digunakan).
● Pendapatan berikutnya: diperkirakan diterima sekitar 30 hari lagi (1 Des 2026).

2. Alokasi dari Total Saldo Rekening (Rp18.000.000):
  ○ Rp8.000.000 merupakan Dana Darurat yang telah dikumpulkan sebelumnya (Target: Rp12.000.000 • Kekurangan: Rp4.000.000).
  ○ Rp2.000.000 merupakan dana yang telah disisihkan untuk mengikuti program sertifikasi profesional.
  ○ Rp8.000.000 merupakan pendapatan yang baru diterima dan tersedia untuk dialokasikan pada bulan berjalan (belum digunakan untuk kebutuhan/kewajiban).

3. Rencana Finansial Mendatang:
● Biaya program sertifikasi profesional: diperkirakan sebesar Rp4.000.000–Rp4.500.000.
● Rencana pelaksanaan sertifikasi: sekitar 2–3 bulan lagi.

4. Kewajiban Pembayaran & Pengeluaran Rutin:
● Biaya sewa tempat tinggal: Rp2.400.000 (harus dibayar 10 Nov 2026, 9 hari lagi).
● Tagihan kartu kredit / BNPL: Rp600.000 (harus dibayar 7 Nov 2026, 6 hari lagi).
● Tagihan utilitas bulan ini: diperkirakan sebesar Rp400.000–Rp600.000 (status estimasi).
● Kebutuhan hidup sehari-hari: rata-rata 3 bulan terakhir (Agustus–Okt) berkisar antara Rp2.400.000–Rp3.000.000 per bulan (di luar tempat tinggal, kartu, dan utilitas).

5. Catatan Tambahan:
● Tidak terdapat pembayaran besar lain yang telah diketahui pada bulan ini.
● Tidak terdapat sumber pendapatan tambahan yang telah dipastikan sebelum pendapatan berikutnya diterima.`,
      tugasText: `Gunakan chatbot yang tersedia untuk membantu Anda menentukan bagaimana pendapatan bulan ini sebaiknya dialokasikan.`,
      descriptionText: `Pertimbangan alokasi penambahan tabungan dana darurat dari pendapatan bulanan.`,
      initialAction: {
        type: "saving",
        amount: 2000000,
        timing: "Bulan ini",
        targetCategory: "Penambahan Tabungan Dana Darurat",
        description: "Penyisihan tabungan ke Dana Darurat sebesar Rp 2.000.000 dari pendapatan",
        source: "scenario",
      },
      actionOptions: [1000000, 2000000, 3000000],
      initialAssistantMessage: `Halo! Saya siap mendampingi Anda mengevaluasi alokasi pendapatan bulan ini, termasuk opsi penambahan tabungan ke Dana Darurat (misalnya Rp 1.000.000, Rp 2.000.000, atau Rp 3.000.000) serta dampaknya terhadap pos sertifikasi sebelum Anda mengambil keputusan. Apa yang ingin Anda diskusikan terlebih dahulu?`,
      quickReplies: [
        "Bagaimana jika saya menyisihkan Rp 2.000.000?",
        "Bagaimana pengaruhnya terhadap pos dana sertifikasi profesional?",
        "Bagaimana jika saya menyisihkan Rp 1.000.000?",
        "Berapa sisa kas setelah melunasi tagihan wajib?",
      ],
      tugasQuestions: [
        {
          id: "q1",
          question: "Setelah berdiskusi dengan chatbot, apakah Anda akan menambah Dana Darurat dari pendapatan bulan ini?",
          options: ["Ya", "Tidak"],
          type: "radio",
        },
        {
          id: "q2",
          question: "Jika Ya, berapa jumlah yang akan Anda tambahkan?",
          options: ["Rp1.000.000", "Rp2.000.000", "Rp3.000.000", "Jumlah lainnya"],
          type: "radio",
        },
        {
          id: "q3",
          question: "Jelaskan alasan keputusan Anda!",
          type: "text",
        },
      ],
    },
    syntheticProfile: {
      id: "prof_save_high",
      scenarioId: "saving_high",
      h0Date: "2026-11-01",
      totalCashBalance: 18000000,
      liquidBalance: 8000000,
      allocations: {
        emergency: 8000000,
        operating: 8000000,
        certification: 2000000,
      },
      budgets: [
        {
          category: "Pendapatan Tersedia Bulan Berjalan",
          allocated: 8000000,
          spentSoFar: 0,
          remaining: 8000000,
          source: "synthetic_profile",
        },
      ],
      liabilities: [
        {
          id: "card",
          title: "Tagihan Kartu Kredit/BNPL",
          amount: 600000,
          dueDate: "2026-11-07", // 6 hari dari H0
          isPriority: true,
          status: "unpaid",
          source: "synthetic_profile",
        },
        {
          id: "rent",
          title: "Biaya Sewa Tempat Tinggal",
          amount: 2400000,
          dueDate: "2026-11-10", // 9 hari dari H0
          isPriority: true,
          status: "unpaid",
          source: "synthetic_profile",
        },
        {
          id: "utilities",
          title: "Tagihan Utilitas Bulan Ini",
          amount: 500000, // Titik tengah estimasi
          amountMin: 400000,
          amountMax: 600000,
          dueDate: null, // Status estimasi
          isPriority: true,
          status: "estimated",
          period: "2026-11",
          source: "synthetic_profile",
        },
      ],
      goals: [
        {
          id: "emergency_goal",
          title: "Target Dana Darurat",
          targetAmount: 12000000,
          currentAllocated: 8000000,
          priority: "high",
          lockIn: false,
          source: "synthetic_profile",
        },
        {
          id: "cert_goal",
          title: "Program Sertifikasi Profesional",
          targetAmount: 4500000,
          currentAllocated: 2000000,
          priority: "high",
          lockIn: false,
          source: "synthetic_profile",
        },
      ],
      buffer: {
        name: "Cadangan Kas Operasional",
        minAmount: 0,
        currentAmount: 8000000,
        source: "synthetic_profile",
      },
      routineExpenses: {
        monthlyEstimate: 2700000,
        spentSoFar: 0,
        remainingEstimate: 2700000,
        range: { min: 2400000, max: 3000000 },
        source: "synthetic_profile",
      },
      incomeSchedule: {
        sourceName: "Pendapatan Bulanan Berikutnya",
        amount: 8000000,
        nextDate: "2026-12-01", // 30 hari dari H0
        regularity: "Bulanan",
        source: "synthetic_profile",
      },
      historyMonths: ["2026-08", "2026-09", "2026-10"],
      routineMonthlyTotals: [2400000, 2700000, 3000000],
      emergencyTarget: 12000000,
      certificationGoal: {
        costMin: 4000000,
        costMax: 4500000,
        horizonMonths: [2, 3],
      },
      transactions: (rawSaveHigh?.transactions || []) as unknown as BankTransactionItem[],
      source: "synthetic_profile",
    },
    expectedCalculations: {
      balanceAfterAction: 18000000, // Saldo bank tetap 18jt karena alokasi virtual
      budgetVariance: 6000000, // 8jt kas pendapatan - 2jt tabungan = sisa 6jt kas operasional
      liabilitiesDueBeforeIncome: 3500000,
      remainingCashAfterImmediateObligations: 2500000, // 6jt - 3.5jt
      isLiquidityThreatened: false,
      isBudgetExceeded: false,
      deficitAmount: 0,
    },
  },
];
