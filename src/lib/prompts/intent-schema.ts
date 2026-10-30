import { z } from "zod";

export const ExtractedIntentSchema = z.object({
  intentType: z.enum([
    // Legacy categories
    "inquire",
    "modify_action",
    "ask_impact",
    "clarify_info",
    "final_decision",
    "other",
    // Enhanced Section 8 categories
    "greeting_or_ping",
    "thank_you",
    "decline_discussion",
    "general_impact_query",
    "specific_aspect_query",
    "alternative_exploration",
    "action_modification",
    "relative_modification",
    "constraint_setting",
    "advice_request",
    "request_nominal_calculation",
    "conceptual_question",
    "confusion",
    "fact_provision_or_correction",
    "out_of_scope",
  ]),
  formatDirective: z
    .enum([
      "one_line",
      "yes_no_amount",
      "nominal_only",
      "few_numbers",
      "no_numbers",
      "specific_part_only",
      "detailed",
      "compare",
      "brief_ongoing",
      "detailed_ongoing",
    ])
    .nullable()
    .optional(),
  isThankYouWithNewQuestion: z.boolean().optional(),
  isConceptualQuestion: z.boolean().optional(),
  focalDimension: z
    .enum([
      "liquidity",
      "bills",
      "routine",
      "buffer",
      "goals",
      "installment",
      "alternatives",
      "general",
    ])
    .optional(),
  newAmount: z.number().nullable().optional(),
  relativeDelta: z.number().nullable().optional(), // e.g. -500000 for "kurangi 500 ribu"
  newTiming: z.string().nullable().optional(),
  preferredPaymentMethod: z.enum(["cash", "installment"]).nullable().optional(),
  userProvidedFinances: z
    .object({
      balance: z.number().optional(),
      budget: z.number().optional(),
      income: z.number().optional(),
      liabilities: z.number().optional(),
      buffer: z.number().optional(),
      routine: z.number().optional(),
      historicalRoutine: z.number().optional(),
      spentSoFar: z.number().optional(),
      emergencyCurrent: z.number().optional(),
      emergencyTarget: z.number().optional(),
      goals: z.string().optional(),
      rawUserFigures: z.array(z.number()).optional(),
    })
    .nullable()
    .optional(),
  userConstraints: z
    .object({
      prohibitCertificationFunds: z.boolean().optional(),
      maintainBufferAmount: z.number().optional(),
      preferredPaymentMethod: z.enum(["cash", "installment"]).optional(),
      preferredTenor: z.number().optional(),
    })
    .nullable()
    .optional(),
  isAlternativeOnly: z.boolean().optional(),
  referencedEntity: z.string().optional(),
  decision: z.enum(["proceed", "modify", "postpone", "cancel"]).nullable().optional(),
  summaryOfIntent: z.string().optional(),
});

export type ExtractedIntent = z.infer<typeof ExtractedIntentSchema>;
