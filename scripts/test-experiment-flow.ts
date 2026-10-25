import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { db } from "../src/db";
import { participants, sessions } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { assignBalancedCell } from "../src/lib/randomizer";

async function testFullFlow() {
  console.log("=== 1. Testing Balanced Randomizer ===");
  const cell = await assignBalancedCell();
  console.log("Assigned Cell:", cell);

  console.log("=== 2. Checking Participants Table in DB ===");
  const totalParts = await db.select().from(participants);
  console.log("Current total participants in DB:", totalParts.length);

  console.log("Flow verification complete!");
}

testFullFlow()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
