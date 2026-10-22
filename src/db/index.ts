import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL || "postgresql://localhost:5432/skripsi_chat";

// Configure pool to support both local postgres and SSL connection on hosted DB (Neon/Supabase)
const pool = new Pool({
  connectionString,
  ssl:
    process.env.NODE_ENV === "production" &&
    !connectionString.includes("localhost")
      ? { rejectUnauthorized: false }
      : false,
});

export const db = drizzle(pool, { schema });
export { pool };
