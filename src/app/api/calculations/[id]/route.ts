import { z } from "zod";
import { findCalculation } from "@/lib/calculationsRepo";
import { getPool } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { loanInputSchema } from "@/schemas/loanInput";
import { storedSummarySchema } from "@/schemas/saveCalculation";

/** One saved calculation with its full inputs, e.g. to reload it into the calculator. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return jsonError(400, "Invalid calculation id");

  const row = await findCalculation(getPool(), id);
  if (!row) return jsonError(404, "Calculation not found");

  return Response.json({
    id: row.id,
    title: row.title,
    loanType: row.loanType,
    inputs: loanInputSchema.parse(row.inputs),
    summary: storedSummarySchema.parse(row.summaryResults),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
