CREATE TABLE "messages" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"extracted_intent" jsonb,
	"calculation_snapshot" jsonb,
	"sources_used" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"participant_code" varchar(64) NOT NULL,
	"consent" boolean DEFAULT false NOT NULL,
	"cell_number" integer,
	"scenario_id" varchar(64),
	"condition" varchar(32),
	"session_id" varchar(64),
	"demographics" jsonb,
	"early_decision" jsonb,
	"final_decision" jsonb,
	"post_questionnaire" jsonb,
	"current_step" integer DEFAULT 1 NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"disqualified" boolean DEFAULT false NOT NULL,
	"disqualified_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "participants_participant_code_unique" UNIQUE("participant_code")
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"title" text NOT NULL,
	"action_type" varchar(32) NOT NULL,
	"conflict_level" varchar(32) NOT NULL,
	"situasi_text" text,
	"kondisi_keuangan_text" text,
	"tugas_text" text,
	"description_text" text NOT NULL,
	"initial_action" jsonb NOT NULL,
	"initial_assistant_message" text NOT NULL,
	"quick_replies" jsonb NOT NULL,
	"comprehension_questions" jsonb,
	"tugas_questions" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scenarios_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"participant_code" varchar(64) NOT NULL,
	"scenario_id" varchar(64) NOT NULL,
	"condition" varchar(32) NOT NULL,
	"current_action" jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'in_progress' NOT NULL,
	"followup_count" integer DEFAULT 0 NOT NULL,
	"max_followup_allowed" integer DEFAULT 2 NOT NULL,
	"prompt_version" varchar(32) DEFAULT 'v1.0' NOT NULL,
	"model_id" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulated_transactions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"action_type" varchar(32) NOT NULL,
	"amount" integer NOT NULL,
	"decision_status" varchar(32) NOT NULL,
	"user_notes" text,
	"snapshot_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synthetic_profiles" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"scenario_id" varchar(64) NOT NULL,
	"total_cash_balance" integer NOT NULL,
	"liquid_balance" integer NOT NULL,
	"budgets" jsonb NOT NULL,
	"liabilities" jsonb NOT NULL,
	"goals" jsonb NOT NULL,
	"buffer" jsonb NOT NULL,
	"income_schedule" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_transactions" ADD CONSTRAINT "simulated_transactions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthetic_profiles" ADD CONSTRAINT "synthetic_profiles_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE no action ON UPDATE no action;