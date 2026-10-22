export interface ScenarioPackage {
  scenario: {
    id: string;
    code: string;
    title: string;
    actionType: "spending" | "saving";
    conflictLevel: "low" | "high";
    descriptionText: string;
    initialAction: {
      type: "spending" | "saving";
      amount: number;
      timing: string;
      targetCategory: string;
      description: string;
    };
    initialAssistantMessage: string;
    quickReplies: string[];
  };
  syntheticProfile: {
    id: string;
    scenarioId: string;
    totalCashBalance: number;
    liquidBalance: number;
    budgets: Array<{
      category: string;
      allocated: number;
      spentSoFar: number;
      remaining: number;
      source: "synthetic_profile";
    }>;
    liabilities: Array<{
      title: string;
      amount: number;
      dueDate: string;
      isPriority: boolean;
      source: "synthetic_profile";
    }>;
    goals: Array<{
      title: string;
      targetAmount: number;
      currentAllocated: number;
      targetDate?: string;
      priority: "high" | "medium" | "low";
      lockIn: boolean;
      source: "synthetic_profile";
    }>;
    buffer: {
      name: string;
      minAmount: number;
      currentAmount: number;
      source: "synthetic_profile";
    };
    incomeSchedule: {
      sourceName: string;
      amount: number;
      nextDate: string;
      regularity: string;
      source: "synthetic_profile";
    };
  };
  expectedCalculations: {
    balanceAfterAction: number;
    budgetVariance: number; // positive = within budget, negative = budget exceeded
    liabilitiesDueBeforeIncome: number;
    remainingCashAfterImmediateObligations: number;
    isLiquidityThreatened: boolean;
    isBudgetExceeded: boolean;
    deficitAmount: number;
  };
}

export const SCENARIO_PACKAGES: ScenarioPackage[] = [
  // 1. Spending – Low mental account conflict
  {
    scenario: {
      id: "spending_low",
      code: "SCN-SPEND-LOW-01",
      title: "Rencana Pembelian Ponsel Kerja",
      actionType: "spending",
      conflictLevel: "low",
      descriptionText:
        "Anda sedang mempertimbangkan untuk membeli sebuah ponsel penunjang kerja seharga Rp 3.500.000 minggu ini. Anda ingin mengecek kesiapan kondisi keuangan sebelum memutuskan untuk membelinya.",
      initialAction: {
        type: "spending",
        amount: 3500000,
        timing: "Minggu ini (24 Oktober 2026)",
        targetCategory: "Peralatan Kerja & Gadget",
        description: "Pembelian ponsel penunjang kerja",
      },
      initialAssistantMessage:
        "Halo! Saya asisten finansial Anda. Anda sedang mempertimbangkan pembelian ponsel penunjang kerja seharga Rp 3.500.000 minggu ini. Apakah Anda ingin mengevaluasi kesesuaian pembelian ini dengan kondisi keuangan Anda?",
      quickReplies: [
        "Apakah aman membeli ponsel ini minggu ini?",
        "Berapa sisa dana saya jika saya beli sekarang?",
        "Bagaimana jika nominalnya saya ubah ke Rp 2.800.000?",
        "Saya ingin menunda pembelian ini",
      ],
    },
    syntheticProfile: {
      id: "prof_spend_low",
      scenarioId: "spending_low",
      totalCashBalance: 12000000,
      liquidBalance: 7000000,
      budgets: [
        {
          category: "Peralatan Kerja & Gadget",
          allocated: 4000000,
          spentSoFar: 0,
          remaining: 4000000,
          source: "synthetic_profile",
        },
        {
          category: "Biaya Hidup Bulanan",
          allocated: 3500000,
          spentSoFar: 2000000,
          remaining: 1500000,
          source: "synthetic_profile",
        },
      ],
      liabilities: [
        {
          title: "Tagihan Internet & Listrik",
          amount: 450000,
          dueDate: "2026-10-27",
          isPriority: true,
          source: "synthetic_profile",
        },
        {
          title: "Sewa Tempat Tinggal",
          amount: 2000000,
          dueDate: "2026-11-10",
          isPriority: true,
          source: "synthetic_profile",
        },
      ],
      goals: [
        {
          title: "Dana Ujian Sertifikasi Profesi",
          targetAmount: 3000000,
          currentAllocated: 2000000,
          targetDate: "2026-12-15",
          priority: "high",
          lockIn: false,
          source: "synthetic_profile",
        },
      ],
      buffer: {
        name: "Dana Cadangan Darurat",
        minAmount: 3000000,
        currentAmount: 3000000,
        source: "synthetic_profile",
      },
      incomeSchedule: {
        sourceName: "Gaji Bulanan",
        amount: 8000000,
        nextDate: "2026-11-01",
        regularity: "Bulanan",
        source: "synthetic_profile",
      },
    },
    expectedCalculations: {
      balanceAfterAction: 8500000, // 12.000.000 - 3.500.000
      budgetVariance: 500000, // Budget 4.000.000 - 3.500.000 = surplus 500.000
      liabilitiesDueBeforeIncome: 450000, // Only 2026-10-27 (450k) is before 2026-11-01
      remainingCashAfterImmediateObligations: 8050000, // 8.500.000 - 450.000
      isLiquidityThreatened: false,
      isBudgetExceeded: false,
      deficitAmount: 0,
    },
  },

  // 2. Spending – High mental account conflict
  {
    scenario: {
      id: "spending_high",
      code: "SCN-SPEND-HIGH-02",
      title: "Rencana Pembelian Ponsel Kerja",
      actionType: "spending",
      conflictLevel: "high",
      descriptionText:
        "Anda sedang mempertimbangkan untuk membeli sebuah ponsel penunjang kerja seharga Rp 3.500.000 minggu ini. Anda ingin mengecek kesiapan kondisi keuangan sebelum memutuskan untuk membelinya.",
      initialAction: {
        type: "spending",
        amount: 3500000,
        timing: "Minggu ini (24 Oktober 2026)",
        targetCategory: "Peralatan Kerja & Gadget",
        description: "Pembelian ponsel penunjang kerja",
      },
      initialAssistantMessage:
        "Halo! Saya asisten finansial Anda. Anda sedang mempertimbangkan pembelian ponsel penunjang kerja seharga Rp 3.500.000 minggu ini. Apakah Anda ingin mengevaluasi kesesuaian pembelian ini dengan kondisi keuangan Anda?",
      quickReplies: [
        "Apakah aman membeli ponsel ini minggu ini?",
        "Berapa sisa dana saya jika saya beli sekarang?",
        "Bagaimana jika nominalnya saya ubah ke Rp 2.800.000?",
        "Saya ingin menunda pembelian ini",
      ],
    },
    syntheticProfile: {
      id: "prof_spend_high",
      scenarioId: "spending_high",
      totalCashBalance: 5200000,
      liquidBalance: 5200000,
      budgets: [
        {
          category: "Peralatan Kerja & Gadget",
          allocated: 1500000,
          spentSoFar: 500000,
          remaining: 1000000,
          source: "synthetic_profile",
        },
        {
          category: "Biaya Hidup Bulanan",
          allocated: 2500000,
          spentSoFar: 1800000,
          remaining: 700000,
          source: "synthetic_profile",
        },
      ],
      liabilities: [
        {
          title: "Cicilan Laptop & Tagihan Kos",
          amount: 3100000,
          dueDate: "2026-10-28", // BEFORE next income (2026-11-01)
          isPriority: true,
          source: "synthetic_profile",
        },
      ],
      goals: [
        {
          title: "Dana Ujian Sertifikasi Profesi",
          targetAmount: 2000000,
          currentAllocated: 1500000,
          targetDate: "2026-11-15",
          priority: "high",
          lockIn: false,
          source: "synthetic_profile",
        },
      ],
      buffer: {
        name: "Dana Cadangan Darurat",
        minAmount: 1500000,
        currentAmount: 1500000,
        source: "synthetic_profile",
      },
      incomeSchedule: {
        sourceName: "Gaji Bulanan",
        amount: 6000000,
        nextDate: "2026-11-01",
        regularity: "Bulanan",
        source: "synthetic_profile",
      },
    },
    expectedCalculations: {
      balanceAfterAction: 1700000, // 5.200.000 - 3.500.000
      budgetVariance: -2500000, // 1.000.000 remaining - 3.500.000 = exceeded by 2.500.000
      liabilitiesDueBeforeIncome: 3100000, // Due 2026-10-28 before 2026-11-01
      remainingCashAfterImmediateObligations: -1400000, // 1.700.000 - 3.100.000 = -1.400.000 deficit!
      isLiquidityThreatened: true,
      isBudgetExceeded: true,
      deficitAmount: 1400000,
    },
  },

  // 3. Saving – Low mental account conflict
  {
    scenario: {
      id: "saving_low",
      code: "SCN-SAVE-LOW-03",
      title: "Rencana Penempatan Dana Tabungan",
      actionType: "saving",
      conflictLevel: "low",
      descriptionText:
        "Anda sedang mempertimbangkan untuk menyisihkan dana sebesar Rp 2.000.000 ke dalam rekening tabungan fleksibel minggu ini. Anda ingin mengecek kesiapan kondisi keuangan sebelum memindahkan dana tersebut.",
      initialAction: {
        type: "saving",
        amount: 2000000,
        timing: "Minggu ini (24 Oktober 2026)",
        targetCategory: "Tabungan Fleksibel",
        description: "Penempatan dana ke tabungan fleksibel",
      },
      initialAssistantMessage:
        "Halo! Saya asisten finansial Anda. Anda sedang mempertimbangkan untuk menyisihkan dana sebesar Rp 2.000.000 ke rekening tabungan minggu ini. Apakah Anda ingin mengevaluasi kesesuaian rencana tabungan ini dengan kondisi keuangan Anda?",
      quickReplies: [
        "Apakah aman memindahkan dana ini ke tabungan sekarang?",
        "Berapa sisa dana operasional saya setelah menabung?",
        "Bagaimana jika nominal tabungan diubah menjadi Rp 1.500.000?",
        "Saya ingin menunda penempatan dana ini",
      ],
    },
    syntheticProfile: {
      id: "prof_save_low",
      scenarioId: "saving_low",
      totalCashBalance: 9500000,
      liquidBalance: 7500000,
      budgets: [
        {
          category: "Alokasi Tabungan & Investasi",
          allocated: 2500000,
          spentSoFar: 0,
          remaining: 2500000,
          source: "synthetic_profile",
        },
        {
          category: "Kebutuhan Operasional Harian",
          allocated: 3000000,
          spentSoFar: 1600000,
          remaining: 1400000,
          source: "synthetic_profile",
        },
      ],
      liabilities: [
        {
          title: "Tagihan Utilitas & Kartu Pembayaran",
          amount: 600000,
          dueDate: "2026-10-28",
          isPriority: true,
          source: "synthetic_profile",
        },
      ],
      goals: [
        {
          title: "Dana Liburan Akhir Tahun",
          targetAmount: 5000000,
          currentAllocated: 2500000,
          targetDate: "2026-12-20",
          priority: "medium",
          lockIn: false,
          source: "synthetic_profile",
        },
      ],
      buffer: {
        name: "Buffer Kas Operasional",
        minAmount: 2000000,
        currentAmount: 2500000,
        source: "synthetic_profile",
      },
      incomeSchedule: {
        sourceName: "Gaji Bulanan",
        amount: 7500000,
        nextDate: "2026-11-01",
        regularity: "Bulanan",
        source: "synthetic_profile",
      },
    },
    expectedCalculations: {
      balanceAfterAction: 7500000, // 9.500.000 - 2.000.000 (transferred to savings)
      budgetVariance: 500000, // Budget 2.500.000 - 2.000.000 = surplus 500.000
      liabilitiesDueBeforeIncome: 600000, // 600k on 2026-10-28
      remainingCashAfterImmediateObligations: 6900000, // 7.500.000 - 600.000
      isLiquidityThreatened: false,
      isBudgetExceeded: false,
      deficitAmount: 0,
    },
  },

  // 4. Saving – High mental account conflict
  {
    scenario: {
      id: "saving_high",
      code: "SCN-SAVE-HIGH-04",
      title: "Rencana Penempatan Dana Tabungan",
      actionType: "saving",
      conflictLevel: "high",
      descriptionText:
        "Anda sedang mempertimbangkan untuk menyisihkan dana sebesar Rp 2.000.000 ke dalam produk deposito terkunci 12 bulan minggu ini. Anda ingin mengecek kesiapan kondisi keuangan sebelum memindahkan dana tersebut.",
      initialAction: {
        type: "saving",
        amount: 2000000,
        timing: "Minggu ini (24 Oktober 2026)",
        targetCategory: "Deposito Terkunci 12 Bulan",
        description: "Penempatan dana ke deposito terkunci 12 bulan",
      },
      initialAssistantMessage:
        "Halo! Saya asisten finansial Anda. Anda sedang mempertimbangkan untuk menyisihkan dana sebesar Rp 2.000.000 ke produk deposito terkunci minggu ini. Apakah Anda ingin mengevaluasi kesesuaian rencana tabungan ini dengan kondisi keuangan Anda?",
      quickReplies: [
        "Apakah aman memindahkan dana ini ke deposito terkunci sekarang?",
        "Berapa sisa dana operasional saya setelah menabung?",
        "Bagaimana jika nominal tabungan diubah menjadi Rp 1.000.000?",
        "Saya ingin menunda penempatan dana ini",
      ],
    },
    syntheticProfile: {
      id: "prof_save_high",
      scenarioId: "saving_high",
      totalCashBalance: 3200000,
      liquidBalance: 3200000,
      budgets: [
        {
          category: "Alokasi Tabungan & Investasi",
          allocated: 800000,
          spentSoFar: 0,
          remaining: 800000,
          source: "synthetic_profile",
        },
        {
          category: "Kebutuhan Operasional Harian",
          allocated: 2000000,
          spentSoFar: 1400000,
          remaining: 600000,
          source: "synthetic_profile",
        },
      ],
      liabilities: [
        {
          title: "Cicilan Kendaraan & Biaya Kuliah",
          amount: 2500000,
          dueDate: "2026-10-29", // BEFORE next income (2026-11-01)
          isPriority: true,
          source: "synthetic_profile",
        },
      ],
      goals: [
        {
          title: "Dana Rumah Masa Depan",
          targetAmount: 50000000,
          currentAllocated: 5000000,
          priority: "high",
          lockIn: true,
          source: "synthetic_profile",
        },
      ],
      buffer: {
        name: "Buffer Kas Operasional",
        minAmount: 1000000,
        currentAmount: 1000000,
        source: "synthetic_profile",
      },
      incomeSchedule: {
        sourceName: "Gaji Bulanan",
        amount: 5500000,
        nextDate: "2026-11-01",
        regularity: "Bulanan",
        source: "synthetic_profile",
      },
    },
    expectedCalculations: {
      balanceAfterAction: 1200000, // 3.200.000 - 2.000.000
      budgetVariance: -1200000, // 800.000 budget - 2.000.000 = exceeded by 1.200.000
      liabilitiesDueBeforeIncome: 2500000, // Due 2026-10-29 before 2026-11-01
      remainingCashAfterImmediateObligations: -1300000, // 1.200.000 - 2.500.000 = -1.300.000 deficit!
      isLiquidityThreatened: true,
      isBudgetExceeded: true,
      deficitAmount: 1300000,
    },
  },
];
