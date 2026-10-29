import { pgTable, text, varchar, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import type { ExtractedIntent } from "@/lib/prompts/intent-schema";

export const scenarios = pgTable("scenarios", {
  id: varchar("id", { length: 64 }).primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  title: text("title").notNull(),
  actionType: varchar("action_type", { length: 32 }).notNull(), // 'spending' | 'saving'
  conflictLevel: varchar("conflict_level", { length: 32 }).notNull(), // 'low' | 'high' - internal research classification
  situasiText: text("situasi_text"),
  kondisiKeuanganText: text("kondisi_keuangan_text"),
  tugasText: text("tugas_text"),
  descriptionText: text("description_text").notNull(),
  initialAction: jsonb("initial_action").notNull().$type<{
    type: "spending" | "saving";
    amount: number;
    timing: string;
    targetCategory: string;
    description: string;
  }>(),
  initialAssistantMessage: text("initial_assistant_message").notNull(),
  quickReplies: jsonb("quick_replies").notNull().$type<string[]>(),
  comprehensionQuestions: jsonb("comprehension_questions").$type<Array<{
    id: string;
    question: string;
    options: string[];
    correctAnswer: string;
  }>>(),
  tugasQuestions: jsonb("tugas_questions").$type<Array<{
    id: string;
    question: string;
    options?: string[];
    type: "radio" | "text";
  }>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const syntheticProfiles = pgTable("synthetic_profiles", {
  id: varchar("id", { length: 64 }).primaryKey(),
  scenarioId: varchar("scenario_id", { length: 64 })
    .notNull()
    .references(() => scenarios.id),
  totalCashBalance: integer("total_cash_balance").notNull(),
  liquidBalance: integer("liquid_balance").notNull(),
  budgets: jsonb("budgets").notNull().$type<Array<{
    category: string;
    allocated: number;
    spentSoFar: number;
    remaining: number;
    source: "synthetic_profile";
  }>>(),
  liabilities: jsonb("liabilities").notNull().$type<Array<{
    title: string;
    amount: number;
    dueDate: string; // ISO date 'YYYY-MM-DD'
    isPriority: boolean;
    source: "synthetic_profile";
  }>>(),
  goals: jsonb("goals").notNull().$type<Array<{
    title: string;
    targetAmount: number;
    currentAllocated: number;
    targetDate?: string;
    priority: "high" | "medium" | "low";
    lockIn: boolean; // if true, funds in this goal cannot be liquidated immediately without penalty
    source: "synthetic_profile";
  }>>(),
  buffer: jsonb("buffer").notNull().$type<{
    name: string;
    minAmount: number;
    currentAmount: number;
    source: "synthetic_profile";
  }>(),
  incomeSchedule: jsonb("income_schedule").notNull().$type<{
    sourceName: string;
    amount: number;
    nextDate: string; // ISO date 'YYYY-MM-DD'
    regularity: string;
    source: "synthetic_profile";
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  participantCode: varchar("participant_code", { length: 64 }).notNull(),
  scenarioId: varchar("scenario_id", { length: 64 })
    .notNull()
    .references(() => scenarios.id),
  condition: varchar("condition", { length: 32 }).notNull(), // 'basic' | 'context_aware'
  currentAction: jsonb("current_action").notNull().$type<{
    type: "spending" | "saving";
    amount: number;
    timing: string;
    targetCategory: string;
    description: string;
    modifiedByUser?: boolean;
    userProvidedDetails?: Record<string, unknown>;
  }>(),
  status: varchar("status", { length: 32 }).notNull().default("in_progress"), // 'in_progress' | 'proceed' | 'modify' | 'postpone' | 'cancel'
  followupCount: integer("followup_count").notNull().default(0),
  maxFollowupAllowed: integer("max_followup_allowed").notNull().default(2),
  promptVersion: varchar("prompt_version", { length: 32 }).notNull().default("v1.0"),
  modelId: varchar("model_id", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: varchar("id", { length: 64 }).primaryKey(),
  sessionId: varchar("session_id", { length: 64 })
    .notNull()
    .references(() => sessions.id),
  role: varchar("role", { length: 16 }).notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  extractedIntent: jsonb("extracted_intent").$type<ExtractedIntent | null>(),
  calculationSnapshot: jsonb("calculation_snapshot").$type<Record<string, unknown> | null>(),
  sourcesUsed: jsonb("sources_used").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const simulatedTransactions = pgTable("simulated_transactions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  sessionId: varchar("session_id", { length: 64 })
    .notNull()
    .references(() => sessions.id),
  actionType: varchar("action_type", { length: 32 }).notNull(), // 'spending' | 'saving'
  amount: integer("amount").notNull(),
  decisionStatus: varchar("decision_status", { length: 32 }).notNull(), // 'proceed' | 'modify' | 'postpone' | 'cancel'
  userNotes: text("user_notes"),
  snapshotData: jsonb("snapshot_data").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const participants = pgTable("participants", {
  id: varchar("id", { length: 64 }).primaryKey(),
  participantCode: varchar("participant_code", { length: 64 }).notNull().unique(),
  consent: boolean("consent").default(false).notNull(),
  cellNumber: integer("cell_number"), // 1 to 8 (25 respondents each)
  scenarioId: varchar("scenario_id", { length: 64 }),
  condition: varchar("condition", { length: 32 }), // 'basic' | 'context_aware'
  sessionId: varchar("session_id", { length: 64 }),
  demographics: jsonb("demographics").$type<{
    age: number;
    gender: string;
    education: string;
    occupation: string;
    monthlyIncome: string;
    chatbotExperience: string;
    financialKnowledge: string;
  } | null>(),
  earlyDecision: jsonb("early_decision").$type<{
    q1: string;
    q2?: string;
    q3: string;
  } | null>(),
  finalDecision: jsonb("final_decision").$type<{
    q1: string;
    q2?: string;
    q3: string;
  } | null>(),
  postQuestionnaire: jsonb("post_questionnaire").$type<Record<string, number> | null>(),
  currentStep: integer("current_step").default(1).notNull(),
  isCompleted: boolean("is_completed").default(false).notNull(),
  disqualified: boolean("disqualified").default(false).notNull(),
  disqualifiedReason: text("disqualified_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
