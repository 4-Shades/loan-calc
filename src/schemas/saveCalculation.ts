import { z } from "zod";
import { sanitizeTitle } from "@/lib/sanitize";
import { loanInputSchema } from "./loanInput";

/**
 * Body of POST /api/calculations (REQ-FUNC-DB01, REQ-NFR-CODE2). Only the title
 * and the loan input are accepted; results are recomputed on the server, so a
 * client cannot store figures that don't follow from its inputs.
 */
export const saveCalculationRequestSchema = z.strictObject({
  title: z
    .string({ error: "Enter a title" })
    .transform(sanitizeTitle)
    .pipe(z.string().min(1, "Enter a title").max(150, "Use at most 150 characters")),
  input: loanInputSchema,
});

export type SaveCalculationRequest = z.infer<typeof saveCalculationRequestSchema>;

const cents = z.number().int();

/** summary_results JSONB: what the comparison matrix and listings need without recalculating. */
export const storedSummarySchema = z.object({
  category: z.enum(["PERSONAL", "BUSINESS"]),
  /** Amount borrowed: principal, balance, financed amount or advance. */
  loanAmountCents: cents,
  regularPaymentCents: cents,
  totalInterestCents: cents,
  totalFeesCents: cents,
  totalPaidCents: cents,
  periods: z.number().int(),
  /** Business loans only. */
  effectiveAprPercent: z.number().nullable(),
});

export type StoredSummary = z.infer<typeof storedSummarySchema>;
