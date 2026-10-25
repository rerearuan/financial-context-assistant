export interface ScenarioPackage {
  scenario: {
    id: string;
    code: string;
    title: string;
    actionType: "spending" | "saving";
    conflictLevel: "low" | "high";
    situasiText: string;
    kondisiKeuanganText: string;
    tugasText: string;
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
    tugasQuestions: Array<{
      id: string;
      question: string;
      options?: string[];
      type: "radio" | "text";
    }>;
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
    budgetVariance: number;
    liabilitiesDueBeforeIncome: number;
    remainingCashAfterImmediateObligations: number;
    isLiquidityThreatened: boolean;
    isBudgetExceeded: boolean;
    deficitAmount: number;
  };
}

export const SCENARIO_PACKAGES: ScenarioPackage[] = [
  // 1. Spending – Low MAC
  {
    scenario: {
      id: "spending_low",
      code: "SCN-SPEND-LOW",
      title: "Skenario Spending dengan Low MAC",
      actionType: "spending",
      conflictLevel: "low",
      situasiText: `Anda sedang mempertimbangkan untuk membeli laptop baru untuk mendukung pekerjaan dan aktivitas sehari-hari.

Laptop yang Anda gunakan saat ini masih dapat digunakan, tetapi performanya mulai menurun. Dalam beberapa minggu terakhir, laptop tersebut beberapa kali mengalami lag ketika menjalankan aplikasi yang Anda gunakan untuk bekerja dan beraktivitas sehari-hari.

Karena kondisi tersebut, selama beberapa bulan terakhir Anda memang telah merencanakan untuk mengganti laptop dan mulai menyisihkan uang untuk kebutuhan tersebut.

Anda menemukan laptop yang sesuai dengan kebutuhan dengan harga normal Rp8.500.000. Saat ini laptop tersebut sedang ditawarkan dengan harga Rp7.000.000, dan promosi hanya berlaku sampai hari ini.

Tersedia dua metode pembayaran:
● Tunai: Rp7.000.000
● Cicilan: tenor 12 bulan, bunga flat 1,2% per bulan, serta biaya administrasi 1% dari harga barang`,
      kondisiKeuanganText: `● Saldo rekening Anda saat ini: Rp18.000.000.
● Pendapatan bulanan: Rp8.000.000.
● Pendapatan berikutnya diperkirakan diterima dalam 12 hari.
● Dari saldo tersebut:
  ○ Rp5.000.000 merupakan Dana Darurat yang ingin Anda pertahankan
  ○ Rp6.000.000 merupakan dana yang selama beberapa bulan terakhir Anda sisihkan untuk pembelian laptop
  ○ Sisanya (Rp7.000.000) merupakan dana yang digunakan untuk kebutuhan bulan berjalan
● Berdasarkan riwayat transaksi, pengeluaran rutin untuk kebutuhan sehari-hari selama bulan berjalan telah mencapai sekitar Rp2.400.000.
● Dalam tiga bulan terakhir, pengeluaran rutin untuk kebutuhan sehari-hari Anda berkisar antara Rp3.800.000–Rp4.600.000 per bulan, di luar tagihan khusus.
● Dalam 6 hari ke depan, terdapat tagihan sebesar Rp1.800.000 yang harus dibayar.
● Tidak terdapat pembayaran besar lain yang telah diketahui hingga pendapatan berikutnya diterima.`,
      tugasText: `Gunakan chatbot yang tersedia untuk membantu Anda mempertimbangkan keputusan Pembelian Laptop.`,
      descriptionText: `Pertimbangan pembelian laptop baru seharga Rp7.000.000 (promo hari ini dari harga normal Rp8.500.000) dengan opsi tunai atau cicilan 12 bulan.`,
      initialAction: {
        type: "spending",
        amount: 7000000,
        timing: "Hari ini (Promo terbatas)",
        targetCategory: "Pembelian Laptop Baru",
        description: "Pembelian laptop baru penunjang kerja (Tunai Rp7.000.000 atau Cicilan 12 bulan)",
      },
      initialAssistantMessage: `Halo! Saya asisten percakapan finansial Anda. Anda sedang mempertimbangkan pembelian laptop baru seharga Rp7.000.000 hari ini (harga promo dari Rp8.500.000) dengan opsi pembayaran tunai atau cicilan 12 bulan. Apakah Anda ingin mengevaluasi keputusan ini dan membandingkan opsi pembayarannya dengan kondisi keuangan Anda?`,
      quickReplies: [
        "Apakah aman membeli laptop ini secara tunai?",
        "Bagaimana jika saya memilih opsi cicilan 12 bulan?",
        "Berapa sisa dana operasional saya setelah tagihan terdekat?",
        "Apakah pembelian ini mengganggu dana darurat saya?",
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
      totalCashBalance: 18000000,
      liquidBalance: 7000000,
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
          title: "Tagihan Khusus 6 Hari Ke Depan",
          amount: 1800000,
          dueDate: "2026-10-31",
          isPriority: true,
          source: "synthetic_profile",
        },
      ],
      goals: [
        {
          title: "Pembelian Laptop",
          targetAmount: 7000000,
          currentAllocated: 6000000,
          priority: "high",
          lockIn: false,
          source: "synthetic_profile",
        },
      ],
      buffer: {
        name: "Dana Darurat",
        minAmount: 5000000,
        currentAmount: 5000000,
        source: "synthetic_profile",
      },
      incomeSchedule: {
        sourceName: "Pendapatan Bulanan",
        amount: 8000000,
        nextDate: "2026-11-06",
        regularity: "Bulanan",
        source: "synthetic_profile",
      },
    },
    expectedCalculations: {
      balanceAfterAction: 11000000, // 18jt - 7jt
      budgetVariance: -1000000, // Alokasi laptop 6jt - 7jt = kurang 1jt (tertutup dari kas berjalan 4.6jt)
      liabilitiesDueBeforeIncome: 1800000, // Tagihan 1.8jt jatuh tempo dalam 6 hari sebelum gaji dalam 12 hari
      remainingCashAfterImmediateObligations: 9200000, // 11jt - 1.8jt
      isLiquidityThreatened: false,
      isBudgetExceeded: true,
      deficitAmount: 0,
    },
  },

  // 2. Spending – High MAC
  {
    scenario: {
      id: "spending_high",
      code: "SCN-SPEND-HIGH",
      title: "Skenario Spending dengan High MAC",
      actionType: "spending",
      conflictLevel: "high",
      situasiText: `Anda sedang mempertimbangkan untuk membeli laptop baru untuk mendukung pekerjaan dan aktivitas sehari-hari.

Laptop yang Anda gunakan saat ini masih dapat digunakan, tetapi performanya mulai menurun. Dalam beberapa minggu terakhir, laptop tersebut beberapa kali mengalami lag ketika menjalankan aplikasi yang Anda gunakan untuk bekerja dan beraktivitas sehari-hari.

Karena kondisi tersebut, selama beberapa bulan terakhir Anda telah merencanakan untuk mengganti laptop dan mulai menyisihkan uang untuk kebutuhan tersebut.

Pada saat yang sama, Anda juga sedang mempersiapkan dana untuk mengikuti program sertifikasi profesional yang ingin Anda ambil dalam beberapa bulan ke depan. Program tersebut menurut Anda penting karena dapat mendukung pengembangan kemampuan dan pekerjaan Anda.

Bagi Anda, mengganti laptop dan mengikuti program sertifikasi sama-sama merupakan tujuan yang penting.

Anda menemukan laptop yang sesuai dengan kebutuhan dengan harga normal Rp8.500.000. Saat ini laptop tersebut sedang ditawarkan dengan harga Rp7.000.000, dan promosi hanya berlaku sampai hari ini.

Tersedia dua metode pembayaran:
● Tunai: Rp7.000.000
● Cicilan: tenor 12 bulan, bunga flat 1,2% per bulan, serta biaya administrasi 1% dari harga barang`,
      kondisiKeuanganText: `● Saldo rekening Anda saat ini: Rp18.000.000.
● Pendapatan bulanan: Rp8.000.000.
● Pendapatan berikutnya diperkirakan diterima dalam 12 hari.
● Dari saldo tersebut:
  ○ Rp5.000.000 merupakan Dana Darurat yang ingin Anda pertahankan
  ○ Rp3.000.000 merupakan dana yang selama beberapa bulan terakhir Anda sisihkan untuk pembelian laptop
  ○ Rp3.000.000 merupakan dana yang Anda sisihkan untuk program sertifikasi profesional
  ○ Sisanya (Rp7.000.000), merupakan saldo yang masih tersedia saat ini untuk kebutuhan bulan berjalan
● Biaya program sertifikasi diperkirakan sebesar Rp4.000.000–Rp4.500.000.
● Anda berencana mengikuti program tersebut sekitar 2–3 bulan lagi.
● Berdasarkan riwayat transaksi, pengeluaran rutin untuk kebutuhan sehari-hari selama bulan berjalan telah mencapai sekitar Rp2.400.000.
● Dalam tiga bulan terakhir, pengeluaran rutin untuk kebutuhan sehari-hari Anda berkisar antara Rp3.800.000–Rp4.600.000 per bulan, di luar tagihan khusus.
● Dalam 6 hari ke depan, terdapat tagihan sebesar Rp1.800.000 yang harus dibayar.
● Tidak terdapat pembayaran besar lain yang telah diketahui hingga pendapatan berikutnya diterima.`,
      tugasText: `Gunakan chatbot yang tersedia untuk membantu Anda mempertimbangkan keputusan Pembelian Laptop.`,
      descriptionText: `Pertimbangan pembelian laptop baru seharga Rp7.000.000 di tengah persaingan alokasi dana dengan persiapan program sertifikasi profesional (Rp4.000.000–Rp4.500.000).`,
      initialAction: {
        type: "spending",
        amount: 7000000,
        timing: "Hari ini (Promo terbatas)",
        targetCategory: "Pembelian Laptop Baru",
        description: "Pembelian laptop baru Rp7.000.000 (bersaing dengan dana sertifikasi profesional)",
      },
      initialAssistantMessage: `Halo! Saya asisten percakapan finansial Anda. Anda sedang mempertimbangkan pembelian laptop baru seharga Rp7.000.000 hari ini, sementara Anda juga sedang mengumpulkan dana untuk program sertifikasi profesional (estimasi Rp4.000.000–Rp4.500.000). Apakah Anda ingin mengevaluasi bagaimana keputusan ini memengaruhi kedua tujuan penting tersebut?`,
      quickReplies: [
        "Apakah pembelian tunai laptop akan mengganggu dana sertifikasi saya?",
        "Bagaimana jika saya mencicil laptop tersebut selama 12 bulan?",
        "Berapa sisa dana kebutuhan rutin saya setelah tagihan 6 hari ke depan?",
        "Pilihan apa yang paling seimbang untuk laptop dan sertifikasi?",
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
      totalCashBalance: 18000000,
      liquidBalance: 7000000,
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
          title: "Tagihan Khusus 6 Hari Ke Depan",
          amount: 1800000,
          dueDate: "2026-10-31",
          isPriority: true,
          source: "synthetic_profile",
        },
      ],
      goals: [
        {
          title: "Program Sertifikasi Profesional",
          targetAmount: 4500000,
          currentAllocated: 3000000,
          targetDate: "2027-01-15",
          priority: "high",
          lockIn: false,
          source: "synthetic_profile",
        },
        {
          title: "Pembelian Laptop",
          targetAmount: 7000000,
          currentAllocated: 3000000,
          priority: "high",
          lockIn: false,
          source: "synthetic_profile",
        },
      ],
      buffer: {
        name: "Dana Darurat",
        minAmount: 5000000,
        currentAmount: 5000000,
        source: "synthetic_profile",
      },
      incomeSchedule: {
        sourceName: "Pendapatan Bulanan",
        amount: 8000000,
        nextDate: "2026-11-06",
        regularity: "Bulanan",
        source: "synthetic_profile",
      },
    },
    expectedCalculations: {
      balanceAfterAction: 11000000, // 18jt - 7jt
      budgetVariance: -4000000, // Pos laptop 3jt - 7jt = defisit pos 4jt (berpotensi menekan dana sertifikasi 3jt atau kas berjalan)
      liabilitiesDueBeforeIncome: 1800000,
      remainingCashAfterImmediateObligations: 9200000,
      isLiquidityThreatened: false,
      isBudgetExceeded: true,
      deficitAmount: 0,
    },
  },

  // 3. Saving – Low MAC
  {
    scenario: {
      id: "saving_low",
      code: "SCN-SAVE-LOW",
      title: "Skenario Saving dengan Low MAC",
      actionType: "saving",
      conflictLevel: "low",
      situasiText: `Anda ingin mengevaluasi bagaimana pendapatan bulanan sebaiknya dialokasikan.

Anda baru menerima pendapatan bulanan dan salah satu tujuan finansial yang sedang Anda prioritaskan adalah meningkatkan Dana Darurat. Anda ingin memperkuat Dana Darurat agar lebih siap menghadapi pengeluaran tidak terduga.

Pada periode ini, tidak terdapat tujuan finansial besar lain yang secara khusus sedang Anda kejar.`,
      kondisiKeuanganText: `● Saldo rekening Anda saat ini: Rp16.000.000.
● Pendapatan bulanan: Rp8.000.000.
● Pendapatan baru diterima hari ini dan pendapatan berikutnya diperkirakan diterima sekitar 30 hari lagi.
● Dari saldo tersebut:
  ○ Rp8.000.000 merupakan dana darurat yang telah Anda kumpulkan sebelumnya, dengan target Rp12.000.000.
  ○ Sisa Rp8.000.000 merupakan pendapatan yang baru diterima dan tersedia untuk dialokasikan pada bulan berjalan.
● Pendapatan yang baru diterima belum digunakan untuk memenuhi kebutuhan atau kewajiban bulan berjalan.
● Dalam tiga bulan terakhir, pengeluaran rutin untuk kebutuhan sehari-hari berkisar antara Rp2.400.000–Rp3.000.000 per bulan, di luar biaya tempat tinggal, tagihan kartu/BNPL, dan utilitas.
● Biaya tempat tinggal sebesar Rp2.400.000 harus dibayar dalam 9 hari.
● Tagihan kartu/BNPL sebesar Rp600.000 harus dibayar dalam 6 hari.
● Tagihan utilitas bulan ini diperkirakan sebesar Rp400.000–Rp600.000.
● Tidak terdapat pembayaran besar lain yang telah diketahui pada bulan ini.
● Tidak terdapat sumber pendapatan tambahan yang telah dipastikan sebelum pendapatan berikutnya diterima.`,
      tugasText: `Gunakan chatbot yang tersedia untuk membantu Anda menentukan bagaimana pendapatan bulan ini sebaiknya dialokasikan.`,
      descriptionText: `Evaluasi penambahan Dana Darurat (target Rp12.000.000, saat ini Rp8.000.000) dari pendapatan bulanan baru Rp8.000.000 tanpa adanya tujuan finansial besar lain yang bersaing.`,
      initialAction: {
        type: "saving",
        amount: 2000000,
        timing: "Bulan ini",
        targetCategory: "Penambahan Dana Darurat",
        description: "Alokasi penambahan Dana Darurat dari pendapatan bulanan baru",
      },
      initialAssistantMessage: `Halo! Saya asisten percakapan finansial Anda. Anda baru menerima pendapatan bulanan sebesar Rp8.000.000 dan berencana menambah Dana Darurat (target Rp12.000.000, saat ini Rp8.000.000). Apakah Anda ingin mengevaluasi berapa nominal yang aman untuk disisihkan dengan mempertimbangkan kewajiban sewa tempat tinggal, kartu/BNPL, utilitas, dan kebutuhan harian bulan ini?`,
      quickReplies: [
        "Berapa total kewajiban dan kebutuhan rutin saya bulan ini?",
        "Apakah aman menyisihkan Rp2.000.000 ke Dana Darurat?",
        "Berapa surplus kas bebas saya bulan ini?",
        "Bagaimana rekomendasi pembagian alokasi gaji saya?",
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
      totalCashBalance: 16000000,
      liquidBalance: 8000000,
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
          title: "Tagihan Kartu/BNPL (6 hari)",
          amount: 600000,
          dueDate: "2026-10-31",
          isPriority: true,
          source: "synthetic_profile",
        },
        {
          title: "Biaya Tempat Tinggal (9 hari)",
          amount: 2400000,
          dueDate: "2026-11-03",
          isPriority: true,
          source: "synthetic_profile",
        },
        {
          title: "Tagihan Utilitas Bulan Ini",
          amount: 500000,
          dueDate: "2026-11-10",
          isPriority: true,
          source: "synthetic_profile",
        },
      ],
      goals: [
        {
          title: "Target Dana Darurat",
          targetAmount: 12000000,
          currentAllocated: 8000000,
          priority: "high",
          lockIn: false,
          source: "synthetic_profile",
        },
      ],
      buffer: {
        name: "Dana Darurat Terkumpul",
        minAmount: 8000000,
        currentAmount: 8000000,
        source: "synthetic_profile",
      },
      incomeSchedule: {
        sourceName: "Pendapatan Bulanan Berikutnya",
        amount: 8000000,
        nextDate: "2026-11-24",
        regularity: "Bulanan",
        source: "synthetic_profile",
      },
    },
    expectedCalculations: {
      balanceAfterAction: 14000000, // 16jt - 2jt dialokasikan
      budgetVariance: 6000000, // 8jt pendapatan baru - 2jt = sisa 6jt untuk kewajiban (total kewajiban ~3.5jt + rutin 2.7jt = 6.2jt)
      liabilitiesDueBeforeIncome: 3500000, // 600k + 2.400k + 500k
      remainingCashAfterImmediateObligations: 10500000, // 14jt - 3.5jt kewajiban
      isLiquidityThreatened: false,
      isBudgetExceeded: false,
      deficitAmount: 0,
    },
  },

  // 4. Saving – High MAC
  {
    scenario: {
      id: "saving_high",
      code: "SCN-SAVE-HIGH",
      title: "Skenario Saving dengan High MAC",
      actionType: "saving",
      conflictLevel: "high",
      situasiText: `Anda ingin mengevaluasi bagaimana pendapatan bulanan sebaiknya dialokasikan.

Anda baru menerima pendapatan bulanan dan salah satu tujuan finansial yang ingin Anda capai adalah meningkatkan Dana Darurat agar lebih siap menghadapi kebutuhan tidak terduga.

Namun, pada saat yang sama, Anda juga masih mempersiapkan dana untuk mengikuti program sertifikasi profesional dalam beberapa bulan ke depan.

Bagi Anda, meningkatkan Dana Darurat dan mengikuti program sertifikasi sama-sama merupakan tujuan yang penting.`,
      kondisiKeuanganText: `● Saldo rekening Anda saat ini: Rp18.000.000.
● Pendapatan bulanan: Rp8.000.000.
● Pendapatan baru diterima hari ini dan pendapatan berikutnya diperkirakan diterima sekitar 30 hari lagi.
● Dari saldo tersebut:
  ○ Rp8.000.000 merupakan dana darurat yang telah dikumpulkan sebelumnya, dengan target Rp12.000.000.
  ○ Rp2.000.000 merupakan dana yang telah disisihkan untuk mengikuti program sertifikasi profesional.
  ○ Sisa Rp8.000.000 merupakan pendapatan yang baru diterima dan tersedia untuk dialokasikan pada bulan berjalan.
● Biaya program sertifikasi diperkirakan sebesar Rp4.000.000–Rp4.500.000.
● Anda berencana mengikuti program tersebut sekitar 2–3 bulan lagi.
● Pendapatan yang baru diterima belum digunakan untuk memenuhi kebutuhan atau kewajiban bulan berjalan.
● Dalam tiga bulan terakhir, pengeluaran rutin untuk kebutuhan sehari-hari Anda berkisar antara Rp2.400.000–Rp3.000.000 per bulan, di luar biaya tempat tinggal, tagihan kartu/BNPL, dan utilitas.
● Biaya tempat tinggal sebesar Rp2.400.000 harus dibayar dalam 9 hari.
● Tagihan kartu/BNPL sebesar Rp600.000 harus dibayar dalam 6 hari.
● Tagihan utilitas bulan ini diperkirakan sebesar Rp400.000–Rp600.000.
● Tidak terdapat pembayaran besar lain yang telah diketahui pada bulan ini.
● Tidak terdapat sumber pendapatan tambahan yang telah dipastikan sebelum pendapatan berikutnya diterima.`,
      tugasText: `Gunakan chatbot yang tersedia untuk membantu Anda menentukan bagaimana pendapatan bulan ini sebaiknya dialokasikan.`,
      descriptionText: `Evaluasi alokasi pendapatan bulanan Rp8.000.000 antara memperkuat Dana Darurat (kurang Rp4.000.000) dan menambah dana persiapan Sertifikasi Profesional (kurang Rp2.000.000–Rp2.500.000 dalam 2–3 bulan lagi).`,
      initialAction: {
        type: "saving",
        amount: 2000000,
        timing: "Bulan ini",
        targetCategory: "Penambahan Dana Darurat vs Sertifikasi",
        description: "Alokasi penambahan tabungan dengan persaingan prioritas Dana Darurat dan Sertifikasi",
      },
      initialAssistantMessage: `Halo! Saya asisten percakapan finansial Anda. Anda baru menerima pendapatan bulanan sebesar Rp8.000.000 dan menghadapi pilihan alokasi antara memperkuat Dana Darurat (target kurang Rp4.000.000) atau mempercepat tabungan Sertifikasi Profesional (kurang Rp2.000.000–Rp2.500.000). Apakah Anda ingin mengevaluasi bagaimana membagi alokasi ini secara optimal setelah memenuhi kebutuhan dan kewajiban bulan ini?`,
      quickReplies: [
        "Berapa surplus dana bebas saya setelah kewajiban tempat tinggal dan tagihan?",
        "Berapa idealnya alokasi untuk Dana Darurat vs Sertifikasi bulan ini?",
        "Apakah jika saya menabung Rp2.000.000 ke Dana Darurat, sertifikasi masih aman?",
        "Bagaimana strategi terbaik menghadapi dua tujuan penting ini?",
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
      totalCashBalance: 18000000,
      liquidBalance: 8000000,
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
          title: "Tagihan Kartu/BNPL (6 hari)",
          amount: 600000,
          dueDate: "2026-10-31",
          isPriority: true,
          source: "synthetic_profile",
        },
        {
          title: "Biaya Tempat Tinggal (9 hari)",
          amount: 2400000,
          dueDate: "2026-11-03",
          isPriority: true,
          source: "synthetic_profile",
        },
        {
          title: "Tagihan Utilitas Bulan Ini",
          amount: 500000,
          dueDate: "2026-11-10",
          isPriority: true,
          source: "synthetic_profile",
        },
      ],
      goals: [
        {
          title: "Program Sertifikasi Profesional",
          targetAmount: 4500000,
          currentAllocated: 2000000,
          targetDate: "2027-01-15",
          priority: "high",
          lockIn: false,
          source: "synthetic_profile",
        },
        {
          title: "Target Dana Darurat",
          targetAmount: 12000000,
          currentAllocated: 8000000,
          priority: "high",
          lockIn: false,
          source: "synthetic_profile",
        },
      ],
      buffer: {
        name: "Dana Darurat Terkumpul",
        minAmount: 8000000,
        currentAmount: 8000000,
        source: "synthetic_profile",
      },
      incomeSchedule: {
        sourceName: "Pendapatan Bulanan Berikutnya",
        amount: 8000000,
        nextDate: "2026-11-24",
        regularity: "Bulanan",
        source: "synthetic_profile",
      },
    },
    expectedCalculations: {
      balanceAfterAction: 16000000, // 18jt - 2jt
      budgetVariance: 6000000,
      liabilitiesDueBeforeIncome: 3500000,
      remainingCashAfterImmediateObligations: 12500000,
      isLiquidityThreatened: false,
      isBudgetExceeded: false,
      deficitAmount: 0,
    },
  },
];
