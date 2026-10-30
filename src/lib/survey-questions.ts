export interface SurveyItem {
  code: string;
  category: string;
  statement: string;
  source: string;
}

export const POST_QUESTIONNAIRE_ITEMS: SurveyItem[] = [
  // Assistant Type (AT)
  {
    code: "AT1",
    category: "Assistant Type (AT)",
    statement: "Chatbot menggunakan informasi mengenai kondisi keuangan saya ketika memberikan respons.",
    source: "Self-developed",
  },
  {
    code: "AT2",
    category: "Assistant Type (AT)",
    statement: "Chatbot mempertimbangkan beberapa informasi keuangan yang relevan secara bersamaan.",
    source: "Self-developed",
  },
  {
    code: "AT3",
    category: "Assistant Type (AT)",
    statement: "Respons chatbot disesuaikan dengan situasi keuangan saya secara keseluruhan.",
    source: "Self-developed",
  },
  {
    code: "AT4",
    category: "Assistant Type (AT)",
    statement: "Chatbot menghubungkan informasi tentang alokasi dana, kewajiban, dan tujuan keuangan saya ketika memberikan pertimbangan.",
    source: "Self-developed",
  },

  // Mental Account Conflict (MAC)
  {
    code: "MAC1",
    category: "Mental Account Conflict (MAC)",
    statement: "Pada skenario yang saya dapatkan, saya perlu mempertimbangkan dua tujuan keuangan yang sama-sama penting.",
    source: "Mayer & Freund (2022)",
  },
  {
    code: "MAC2",
    category: "Mental Account Conflict (MAC)",
    statement: "Pada skenario yang saya dapatkan, dana yang tersedia harus dibagi untuk mencapai dua tujuan keuangan yang berbeda.",
    source: "self-developed",
  },
  {
    code: "MAC3",
    category: "Mental Account Conflict (MAC)",
    statement: "Pada skenario yang saya dapatkan, saya bisa fokus pada satu tujuan keuangan tanpa harus mempertimbangkan tujuan lainnya.",
    source: "Mayer & Freund (2022)",
  },
  {
    code: "MAC4",
    category: "Mental Account Conflict (MAC)",
    statement: "Pada skenario yang saya dapatkan, saya dapat memenuhi satu tujuan keuangan tanpa harus mengurangi alokasi dana untuk tujuan lain yang sama penting.",
    source: "Mayer & Freund (2022)",
  },

  // Relevant Mental Account Salience (RMAS)
  {
    code: "RMAS1",
    category: "Relevant Mental Account Salience (RMAS)",
    statement: "Saat membuat keputusan ini, saya teringat bahwa sebagian uang telah dialokasikan untuk keperluan tertentu.",
    source: "Self-developed",
  },
  {
    code: "RMAS2",
    category: "Relevant Mental Account Salience (RMAS)",
    statement: "Saat membuat keputusan ini, saya teringat pada kebutuhan atau tujuan keuangan lain yang juga memerlukan dana.",
    source: "Self-developed",
  },
  {
    code: "RMAS3",
    category: "Relevant Mental Account Salience (RMAS)",
    statement: "Saat membuat keputusan ini, saya teringat pada kewajiban pembayaran lain yang harus saya penuhi.",
    source: "Self-developed",
  },
  {
    code: "RMAS4",
    category: "Relevant Mental Account Salience (RMAS)",
    statement: "Saat membuat keputusan ini, alokasi dana untuk keperluan lain menjadi perhatian saya.",
    source: "Self-developed",
  },

  // Opportunity Cost Consideration (OCC)
  {
    code: "OCC1",
    category: "Opportunity Cost Consideration (OCC)",
    statement: "Saya mempertimbangkan bagaimana keputusan ini dapat memengaruhi kemampuan saya untuk membiayai keperluan lain di kemudian hari.",
    source: "Spiller (2011)",
  },
  {
    code: "OCC2",
    category: "Opportunity Cost Consideration (OCC)",
    statement: "Saya memikirkan keperluan lain yang dapat dibiayai dengan uang yang sedang saya pertimbangkan dalam keputusan ini.",
    source: "Spiller (2011)",
  },
  {
    code: "OCC3",
    category: "Opportunity Cost Consideration (OCC)",
    statement: "Saya mempertimbangkan keperluan lain yang mungkin tidak dapat saya penuhi apabila dana digunakan untuk keputusan ini.",
    source: "Spiller (2011)",
  },
  {
    code: "OCC4",
    category: "Opportunity Cost Consideration (OCC)",
    statement: "Saya membandingkan manfaat penggunaan dana untuk keputusan ini dengan manfaat penggunaannya untuk keperluan lain.",
    source: "Self-developed",
  },

  // Perceived Financial Decision Appropriateness (PFDA)
  {
    code: "PFDA1",
    category: "Perceived Financial Decision Appropriateness (PFDA)",
    statement: "Keputusan keuangan yang saya pilih sesuai dengan kemampuan keuangan saya.",
    source: "Self-developed",
  },
  {
    code: "PFDA2",
    category: "Perceived Financial Decision Appropriateness (PFDA)",
    statement: "Keputusan keuangan yang saya pilih sesuai dengan kebutuhan yang perlu saya prioritaskan.",
    source: "Self-developed",
  },
  {
    code: "PFDA3",
    category: "Perceived Financial Decision Appropriateness (PFDA)",
    statement: "Keputusan keuangan yang saya pilih sejalan dengan tujuan keuangan yang ingin saya capai.",
    source: "Self-developed",
  },
  {
    code: "PFDA4",
    category: "Perceived Financial Decision Appropriateness (PFDA)",
    statement: "Secara keseluruhan, keputusan keuangan yang saya pilih merupakan pilihan yang tepat bagi situasi keuangan saya saat ini.",
    source: "Self-developed",
  },
];

export const LIKERT_OPTIONS = [
  { value: 1, label: "Sangat Tidak Setuju" },
  { value: 2, label: "Tidak Setuju" },
  { value: 3, label: "Netral" },
  { value: 4, label: "Setuju" },
  { value: 5, label: "Sangat Setuju" },
];

export const DEMOGRAPHIC_OPTIONS = {
  gender: ["Laki-laki", "Perempuan"],
  education: [
    "SMP/Sederajat",
    "SMA/Sederajat",
    "D1-D3/Diploma",
    "D4/S1/Sarjana",
    "S2/Magister",
    "S3/Doktor",
  ],
  occupation: [
    "Pelajar/Mahasiswa",
    "Karyawan/Pegawai",
    "Pekerja lepas (Freelancer)",
    "Wirausaha",
    "Lainnya",
  ],
  monthlyIncome: [
    "Tidak memiliki pendapatan",
    "< Rp2.500.000",
    "Rp2.500.000 - Rp 5.000.000",
    "Rp5.000.001 - Rp 10.000.000",
    "Rp 10.000.001 - Rp 20.000.000",
    "> 20.000.000",
  ],
  chatbotExperience: ["Ya", "Tidak"],
  financialKnowledge: [
    "Sangat kurang",
    "Kurang",
    "Sedang",
    "Baik",
    "Sangat baik",
  ],
};
