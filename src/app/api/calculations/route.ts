import { z } from "zod";
import { calculateLoan } from "@/lib/calculateLoan";
import { insertCalculation, listCalculations } from "@/lib/calculationsRepo";
import { getPool } from "@/lib/db";
import { isJson, isSameOrigin, jsonError, readLimitedText, validationError } from "@/lib/http";
import { clientIp } from "@/lib/rateLimit";
import { createRateLimiter, rateLimitStoreFromEnv } from "@/lib/rateLimitConfig";
import { toStoredSummary } from "@/lib/storedSummary";
import { saveCalculationRequestSchema, storedSummarySchema } from "@/schemas/saveCalculation";

const MAX_BODY_BYTES = 32 * 1024;
const WINDOW_MS = 60_000;
// REQ-NFR-SEC2: 60 saves per minute per client IP, plus a global ceiling that
// still holds if clients rotate a spoofed x-forwarded-for (see clientIp). Counts
// live in memory on Docker and in Upstash Redis on Vercel (D16), chosen by env.
const store = rateLimitStoreFromEnv(process.env);
const perClient = createRateLimiter(store, { name: "client", limit: 60, windowMs: WINDOW_MS });
const overall = createRateLimiter(store, { name: "global", limit: 600, windowMs: WINDOW_MS });
const onVercel = Boolean(process.env.VERCEL);

/** Save a calculation (REQ-FUNC-DB01). Results are recomputed here, never taken from the client. */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return jsonError(403, "Cross-origin requests are not allowed");

  // Check the client's own limit first, so a client that is already blocked
  // doesn't also use up the global allowance everyone shares.
  let limit = await perClient.check(clientIp(request.headers, { onVercel }));
  if (limit.allowed) limit = await overall.check("*");
  if (!limit.allowed) {
    return jsonError(429, `Rate limit exceeded. Try again in ${limit.retryAfterSeconds} seconds.`, {
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  if (!isJson(request)) return jsonError(415, "Content-Type must be application/json");
  const text = await readLimitedText(request, MAX_BODY_BYTES);
  if (text === null) return jsonError(413, "Request body too large");

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonError(400, "Request body must be valid JSON");
  }

  const parsed = saveCalculationRequestSchema.safeParse(body);
  if (!parsed.success) return validationError("Invalid calculation", parsed.error);
  const { title, input } = parsed.data;

  const outcome = calculateLoan(input);
  if (!outcome.ok) return jsonError(422, outcome.error);

  try {
    const saved = await insertCalculation(getPool(), {
      title,
      loanType: input.loanType,
      inputs: input,
      summaryResults: toStoredSummary(input, outcome.result),
    });
    return Response.json(saved, { status: 201, headers: { Location: `/api/calculations/${saved.id}` } });
  } catch (error) {
    console.error("Saving calculation failed", error);
    return jsonError(500, "Could not save the calculation");
  }
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Saved calculations, newest first, without their full inputs. */
export async function GET(request: Request): Promise<Response> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = listQuerySchema.safeParse(params);
  if (!query.success) return validationError("Invalid query", query.error);
  const { limit, offset } = query.data;

  const rows = await listCalculations(getPool(), { limit, offset });
  const items = rows.map(({ summaryResults, ...row }) => ({ ...row, summary: storedSummarySchema.parse(summaryResults) }));
  return Response.json({ items, limit, offset });
}
