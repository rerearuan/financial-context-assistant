import { z } from "zod";

export const ExtractedIntentSchema = z.object({
  intentType: z.enum([
    "inquire", // General inquiry / asks question about consequences
    "modify_action", // User wants to change amount, timing, or item
    "ask_impact", // Specific question about budget/liquidity/obligations
    "clarify_info", // User is providing their own financial info (e.g., "saldo saya 10 juta")
    "final_decision", // User wants to proceed, postpone, or cancel
    "other",
  ]),
  newAmount: z.number().nullable().optional(),
  newTiming: z.string().nullable().optional(),
  userProvidedFinances: z
    .object({
      balance: z.number().optional(),
      budget: z.number().optional(),
      income: z.number().optional(),
      liabilities: z.number().optional(),
      buffer: z.number().optional(),
      goals: z.string().optional(),
    })
    .nullable()
    .optional(),
  decision: z.enum(["proceed", "modify", "postpone", "cancel"]).nullable().optional(),
  summaryOfIntent: z.string().optional(),
});

export type ExtractedIntent = z.infer<typeof ExtractedIntentSchema>;
