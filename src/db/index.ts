import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL || "postgresql://localhost:5432/skripsi_chat";

// Configure pool to support both local postgres and SSL connection on hosted DB (Neon/Supabase)
const pool = new Pool({
  connectionString,
  ssl:
    !connectionString.includes("localhost") &&
    !connectionString.includes("127.0.0.1")
      ? { rejectUnauthorized: false }
      : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

// Prevent unhandled error crashes on idle clients in serverless environments
pool.on("error", (err) => {
  console.warn("PostgreSQL Pool idle client warning:", err?.message || err);
});

export const db = drizzle(pool, { schema });
export { pool };
