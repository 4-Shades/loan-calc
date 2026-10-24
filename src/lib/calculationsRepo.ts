import type { Pool } from "pg";

/**
 * Queries on saved_calculations (REQ-FUNC-DB01, DB02). Every value is passed as a
 * bind parameter, never interpolated into SQL (REQ-NFR-SEC1).
 */

export interface SavedCalculationSummaryRow {
  id: string;
  title: string;
  loanType: string;
  createdAt: Date;
  summaryResults: unknown;
}

export interface SavedCalculationRow extends SavedCalculationSummaryRow {
  inputs: unknown;
  updatedAt: Date;
}

interface NewCalculation {
  title: string;
  loanType: string;
  inputs: object;
  summaryResults: object;
}

const SUMMARY_COLUMNS = `id, title, loan_type AS "loanType", created_at AS "createdAt", summary_results AS "summaryResults"`;

export async function insertCalculation(
  pool: Pool,
  { title, loanType, inputs, summaryResults }: NewCalculation,
): Promise<Pick<SavedCalculationRow, "id" | "title" | "loanType" | "createdAt">> {
  const { rows } = await pool.query<Pick<SavedCalculationRow, "id" | "title" | "loanType" | "createdAt">>(
    `INSERT INTO saved_calculations (title, loan_type, inputs, summary_results)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     RETURNING id, title, loan_type AS "loanType", created_at AS "createdAt"`,
    // JSON.stringify drops optional fields that are undefined.
    [title, loanType, JSON.stringify(inputs), JSON.stringify(summaryResults)],
  );
  return rows[0]!;
}

/** Newest first; id breaks ties between rows saved in the same instant. */
export async function listCalculations(
  pool: Pool,
  { limit, offset }: { limit: number; offset: number },
): Promise<SavedCalculationSummaryRow[]> {
  const { rows } = await pool.query<SavedCalculationSummaryRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM saved_calculations ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

export async function findCalculation(pool: Pool, id: string): Promise<SavedCalculationRow | undefined> {
  const { rows } = await pool.query<SavedCalculationRow>(
    `SELECT ${SUMMARY_COLUMNS}, inputs, updated_at AS "updatedAt" FROM saved_calculations WHERE id = $1`,
    [id],
  );
  return rows[0];
}

export async function ping(pool: Pool): Promise<void> {
  await pool.query("SELECT 1");
}
