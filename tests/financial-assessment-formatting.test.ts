import { describe, it, expect } from "vitest";
import { generateSafeFallbackResponse } from "@/lib/gemini";
import { buildStructuredContextPacket } from "@/lib/financial-engine/context-packager";
import { validateAssistantOutput } from "@/lib/financial-engine/output-guardrail";
import { SCENARIO_PACKAGES } from "@/fixtures/scenarios";
import { FinancialAction } from "@/lib/financial-engine/types";
import { buildUserPrompt, SHARED_SYSTEM_INSTRUCTION } from "@/lib/prompts/templates";

describe("Formatting Asesmen Finansial (Emoji Bullets, Direct Answer, & Kesimpulan)", () => {
  const spendLowPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_low")!;
  const spendHighPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "spending_high")!;
  const saveLowPkg = SCENARIO_PACKAGES.find((p) => p.scenario.id === "saving_low")!;

  // --------------------------------------------------------------------------
  // Skenario 1: Evaluasi Spending Low (Aman)
  // --------------------------------------------------------------------------
  it("Skenario 1: Menghasilkan format pembuka direct answer, poin ber-emoji, dan kesimpulan aman pada Spending Low", () => {
    const action: FinancialAction = {
      type: "spending",
      amount: 7000000,
      timing: "Hari ini",
      targetCategory: "Pembelian Laptop",
      description: "Membeli laptop baru",
      source: "scenario",
    };

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: spendLowPkg.syntheticProfile,
    });

    const reply = generateSafeFallbackResponse(packet, "Apa dampaknya terhadap kondisi keuangan saya jika membeli laptop Rp 7 juta secara tunai?");

    // 1. Kalimat pembuka singkat direct answer
    expect(reply).toMatch(/Jika Anda membeli laptop Rp 7\.000\.000 secara tunai, kondisi keuangan Anda \*\*masih aman\*\*/i);

    // 2. Poin-poin informasi menggunakan emoji relevan dan kata kunci ditebalkan
    expect(reply).toContain("💳 **Saldo rekening**");
    expect(reply).toContain("Rp 11.000.000");
    expect(reply).toContain("🗓️ **Setelah membayar tagihan wajib**");
    expect(reply).toContain("Rp 1.800.000");
    expect(reply).toContain("Rp 9.200.000");
    expect(reply).toContain("🛡️ **Dana darurat**");
    expect(reply).toContain("Rp 5.000.000");

    // 3. Kesimpulan di bagian akhir menegaskan status keputusan
    expect(reply).toMatch(/✅ \*\*Kesimpulan:\*\*/i);
    expect(reply).toContain("mencukupi untuk kebutuhan harian sampai gajian");

    // 4. Lolos output guardrail
    const guardrail = validateAssistantOutput(reply, packet);
    expect(guardrail.isValid).toBe(true);
    expect(guardrail.violations).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // Skenario 2: Evaluasi Spending High (Komitmen Ganda / Shortfall)
  // --------------------------------------------------------------------------
  it("Skenario 2: Menegaskan risiko komitmen dan kesimpulan tidak disarankan pada Spending High", () => {
    const action: FinancialAction = {
      type: "spending",
      amount: 7000000,
      timing: "Hari ini",
      targetCategory: "Pembelian Laptop",
      description: "Membeli laptop baru",
      source: "scenario",
    };

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: spendHighPkg.syntheticProfile,
    });

    const reply = generateSafeFallbackResponse(packet, "Apakah aman jika saya beli laptop 7 juta tunai hari ini?");

    // 1. Pembuka menegaskan risiko
    expect(reply).toMatch(/berisiko terhadap komitmen tabungan Anda/i);

    // 2. Poin-poin ber-emoji
    expect(reply).toContain("💳 **Saldo rekening**");
    expect(reply).toContain("Rp 11.000.000");
    expect(reply).toContain("🎯 **Pos anggaran**");
    expect(reply).toContain("Rp 4.000.000"); // selisih alokasi awal
    expect(reply).toContain("🗓️ **Setelah membayar tagihan wajib**");
    expect(reply).toContain("Rp 1.800.000");
    expect(reply).toContain("⚠️ **Komitmen proteksi**");
    expect(reply).toContain("600.000"); // shortfall

    // 3. Kesimpulan menegaskan tidak disarankan
    expect(reply).toMatch(/❌ \*\*Kesimpulan:\*\* Pembelian tunai saat ini tidak disarankan/i);

    // 4. Lolos output guardrail (tidak mengklaim aman sembarangan)
    const guardrail = validateAssistantOutput(reply, packet);
    expect(guardrail.isValid).toBe(true);
    expect(guardrail.violations).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // Skenario 3: Evaluasi Saving (Defisit Alokasi)
  // --------------------------------------------------------------------------
  it("Skenario 3: Menghasilkan format pembuka, poin ber-emoji, rekomendasi alternatif, dan kesimpulan berisiko pada Saving Defisit", () => {
    const action: FinancialAction = {
      type: "saving",
      amount: 2000000,
      timing: "Bulan ini",
      targetCategory: "Penambahan Tabungan Dana Darurat",
      description: "Menabung dana darurat",
      source: "scenario",
    };

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: saveLowPkg.syntheticProfile,
    });

    const reply = generateSafeFallbackResponse(packet, "Bagaimana dampaknya jika saya menyisihkan Rp 2.000.000 ke Dana Darurat?");

    // 1. Pembuka
    expect(reply).toMatch(/berisiko menimbulkan defisit/i);

    // 2. Poin-poin ber-emoji
    expect(reply).toContain("💳 **Total saldo rekening**");
    expect(reply).toContain("Rp 16.000.000");
    expect(reply).toContain("🗓️ **Kewajiban tagihan**");
    expect(reply).toContain("Rp 3.500.000");
    expect(reply).toContain("📉 **Uang belanja bulanan**");
    expect(reply).toContain("🎯 **Rekomendasi alokasi:**");
    expect(reply).toContain("Rp 1.000.000");

    // 3. Kesimpulan
    expect(reply).toMatch(/⚠️ \*\*Kesimpulan:\*\* Keputusan menabung Rp 2\.000\.000 tidak disarankan/i);

    // 4. Lolos output guardrail
    const guardrail = validateAssistantOutput(reply, packet);
    expect(guardrail.isValid).toBe(true);
    expect(guardrail.violations).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // Skenario 4: Fleksibilitas Konteks (Non-Assessment tidak dipaksakan bullet/emoji)
  // --------------------------------------------------------------------------
  it("Skenario 4: Pertanyaan non-asesmen (sapaan, konsep, satu baris, terima kasih) tidak dipaksakan ke format bullet emoji", () => {
    const action: FinancialAction = {
      type: "spending",
      amount: 7000000,
      timing: "Hari ini",
      targetCategory: "Pembelian Laptop",
      description: "Membeli laptop baru",
      source: "scenario",
    };

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action,
      syntheticProfile: spendLowPkg.syntheticProfile,
    });

    // 4a. Terima kasih
    const replyThanks = generateSafeFallbackResponse(packet, "Terima kasih banyak infonya!");
    expect(replyThanks).toBe("Sama-sama, semoga membantu.");
    expect(replyThanks).not.toContain("💳");
    expect(replyThanks).not.toContain("Kesimpulan:");

    // 4b. Format satu baris
    const replyOneLine = generateSafeFallbackResponse(
      {
        ...packet,
        conversationState: {
          ...packet.conversationState,
          localFormatInstruction: "one_line",
        },
      },
      "Jawab dalam satu baris saja: aman atau tidak?"
    );
    expect(replyOneLine.split("\n").length).toBe(1);
    expect(replyOneLine).not.toContain("💳");
    expect(replyOneLine).not.toContain("Kesimpulan:");

    // 4c. Pertanyaan konseptual
    const replyConcept = generateSafeFallbackResponse(
      {
        ...packet,
        responsePlan: {
          ...packet.responsePlan,
          intentType: "conceptual_question",
        },
      },
      "Apa fungsi dana darurat?"
    );
    expect(replyConcept).toContain("bantalan pengaman keuangan");
    expect(replyConcept).not.toContain("💳");
    expect(replyConcept).not.toContain("Kesimpulan:");
  });

  // --------------------------------------------------------------------------
  // Skenario 5: Verifikasi Prompt Instruction
  // --------------------------------------------------------------------------
  it("Skenario 5: Prompt instruction & user prompt memuat standar financial assessment dan fleksibilitas non-assessment", () => {
    expect(SHARED_SYSTEM_INSTRUCTION).toContain("STANDAR FORMAT FINANCIAL ASSESSMENT");
    expect(SHARED_SYSTEM_INSTRUCTION).toContain("Poin-Poin Informasi Ber-Emoji");
    expect(SHARED_SYSTEM_INSTRUCTION).toContain("Kesimpulan di Bagian Akhir");
    expect(SHARED_SYSTEM_INSTRUCTION).toContain("Fleksibilitas Konteks (Non-Assessment)");

    const packet = buildStructuredContextPacket({
      condition: "context_aware",
      action: {
        type: "spending",
        amount: 7000000,
        timing: "Hari ini",
        targetCategory: "Pembelian Laptop",
        description: "Membeli laptop baru",
        source: "scenario",
      },
      syntheticProfile: spendLowPkg.syntheticProfile,
    });

    const userPrompt = buildUserPrompt(packet, "Apa dampaknya terhadap keuangan saya?", "");
    expect(userPrompt).toContain("Jika pengguna meminta evaluasi atau asesmen finansial");
    expect(userPrompt).toContain("poin-poin informasi kunci menggunakan emoji relevan");
    expect(userPrompt).toContain("Akhiri dengan kesimpulan tegas di bagian akhir");
    expect(userPrompt).toContain("Fleksibilitas Konteks");
  });
});
