import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { pool } from "./index";

export async function runMigration() {
  console.log("Running database migrations...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Scenarios table
    await client.query(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(64) NOT NULL UNIQUE,
        title TEXT NOT NULL,
        action_type VARCHAR(32) NOT NULL,
        conflict_level VARCHAR(32) NOT NULL,
        situasi_text TEXT,
        kondisi_keuangan_text TEXT,
        tugas_text TEXT,
        description_text TEXT NOT NULL,
        initial_action JSONB NOT NULL,
        initial_assistant_message TEXT NOT NULL,
        quick_replies JSONB NOT NULL,
        tugas_questions JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);

    // Add optional columns if upgrading existing table
    await client.query(`
      ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS situasi_text TEXT;
      ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS kondisi_keuangan_text TEXT;
      ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS tugas_text TEXT;
      ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS tugas_questions JSONB;
      ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS comprehension_questions JSONB;
    `);

    // 2. Synthetic Profiles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS synthetic_profiles (
        id VARCHAR(64) PRIMARY KEY,
        scenario_id VARCHAR(64) NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        total_cash_balance INTEGER NOT NULL,
        liquid_balance INTEGER NOT NULL,
        budgets JSONB NOT NULL,
        liabilities JSONB NOT NULL,
        goals JSONB NOT NULL,
        buffer JSONB NOT NULL,
        income_schedule JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);

    // 3. Sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(64) PRIMARY KEY,
        participant_code VARCHAR(64) NOT NULL,
        scenario_id VARCHAR(64) NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        condition VARCHAR(32) NOT NULL,
        current_action JSONB NOT NULL,
        status VARCHAR(32) DEFAULT 'in_progress' NOT NULL,
        followup_count INTEGER DEFAULT 0 NOT NULL,
        max_followup_allowed INTEGER DEFAULT 2 NOT NULL,
        prompt_version VARCHAR(32) DEFAULT 'v1.0' NOT NULL,
        model_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);

    // 4. Messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(64) PRIMARY KEY,
        session_id VARCHAR(64) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role VARCHAR(16) NOT NULL,
        content TEXT NOT NULL,
        extracted_intent JSONB,
        calculation_snapshot JSONB,
        sources_used JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);

    // 5. Simulated Transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS simulated_transactions (
        id VARCHAR(64) PRIMARY KEY,
        session_id VARCHAR(64) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        action_type VARCHAR(32) NOT NULL,
        amount INTEGER NOT NULL,
        decision_status VARCHAR(32) NOT NULL,
        user_notes TEXT,
        snapshot_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);

    // 6. Participants table (for full experiment web questionnaire flow)
    await client.query(`
      CREATE TABLE IF NOT EXISTS participants (
        id VARCHAR(64) PRIMARY KEY,
        participant_code VARCHAR(64) NOT NULL UNIQUE,
        consent BOOLEAN DEFAULT FALSE NOT NULL,
        cell_number INTEGER,
        scenario_id VARCHAR(64),
        condition VARCHAR(32),
        session_id VARCHAR(64),
        demographics JSONB,
        early_decision JSONB,
        final_decision JSONB,
        post_questionnaire JSONB,
        current_step INTEGER DEFAULT 1 NOT NULL,
        is_completed BOOLEAN DEFAULT FALSE NOT NULL,
        disqualified BOOLEAN DEFAULT FALSE NOT NULL,
        disqualified_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);

    await client.query("COMMIT");
    console.log("Database migrations applied successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
