import { db } from "@/db";
import { participants } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

export interface CellAssignment {
  cellNumber: number;
  scenarioId: string;
  condition: "basic" | "context_aware";
}

export const EXPERIMENT_CELLS: CellAssignment[] = [
  { cellNumber: 1, scenarioId: "spending_low", condition: "basic" },
  { cellNumber: 2, scenarioId: "spending_low", condition: "context_aware" },
  { cellNumber: 3, scenarioId: "spending_high", condition: "basic" },
  { cellNumber: 4, scenarioId: "spending_high", condition: "context_aware" },
  { cellNumber: 5, scenarioId: "saving_low", condition: "basic" },
  { cellNumber: 6, scenarioId: "saving_low", condition: "context_aware" },
  { cellNumber: 7, scenarioId: "saving_high", condition: "basic" },
  { cellNumber: 8, scenarioId: "saving_high", condition: "context_aware" },
];

export const MAX_PARTICIPANTS_PER_CELL = 25; // 25 x 8 = 200 total

/**
 * Balanced Block Randomizer for 200 respondents across 8 cells.
 * Queries current counts per cell and assigns the least-populated cell.
 */
export async function assignBalancedCell(): Promise<CellAssignment> {
  // Query counts per cell
  const cellCounts = await db
    .select({
      cellNumber: participants.cellNumber,
      count: sql<number>`count(*)::int`,
    })
    .from(participants)
    .where(eq(participants.disqualified, false))
    .groupBy(participants.cellNumber);

  const countMap: Record<number, number> = {};
  for (let i = 1; i <= 8; i++) {
    countMap[i] = 0;
  }
  for (const row of cellCounts) {
    if (row.cellNumber) {
      countMap[row.cellNumber] = Number(row.count) || 0;
    }
  }

  // Find candidate cells that have the minimum count
  let minCount = Infinity;
  let candidateCells: number[] = [];

  for (let i = 1; i <= 8; i++) {
    const current = countMap[i];
    if (current < minCount) {
      minCount = current;
      candidateCells = [i];
    } else if (current === minCount) {
      candidateCells.push(i);
    }
  }

  // If there's a tie, randomly select among the candidate cells to avoid order bias
  const selectedCellNumber =
    candidateCells[Math.floor(Math.random() * candidateCells.length)];

  return EXPERIMENT_CELLS[selectedCellNumber - 1];
}
