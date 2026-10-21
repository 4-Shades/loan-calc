import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { calculateLoan } from "@/lib/calculateLoan";
import { getPrisma } from "@/lib/db";
import { isJson, isSameOrigin, jsonError, readLimitedText, validationError } from "@/lib/http";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";
import { toStoredSummary } from "@/lib/storedSummary";
import { saveCalculationRequestSchema, storedSummarySchema } from "@/schemas/saveCalculation";

const MAX_BODY_BYTES = 32 * 1024;
const WINDOW_MS = 60_000;
// REQ-NFR-SEC2: 60 saves per minute per client IP, plus a global ceiling that
// still holds if clients rotate a spoofed x-forwarded-for (see clientIp).
const perClient = createRateLimiter({ limit: 60, windowMs: WINDOW_MS });
const overall = createRateLimiter({ limit: 600, windowMs: WINDOW_MS });

/** Save a calculation (REQ-FUNC-DB01). Results are recomputed here, never taken from the client. */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return jsonError(403, "Cross-origin requests are not allowed");

  // Check the client's own limit first, so a client that is already blocked
  // doesn't also use up the global allowance everyone shares.
  let limit = perClient.check(clientIp(request.headers));
  if (limit.allowed) limit = overall.check("*");
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
    const saved = await getPrisma().savedCalculation.create({
      data: {
        title,
        loanType: input.loanType,
        // Round-trip through JSON so optional fields that are undefined are dropped.
        inputs: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonObject,
        summaryResults: toStoredSummary(input, outcome.result),
      },
      select: { id: true, title: true, loanType: true, createdAt: true },
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

  const rows = await getPrisma().savedCalculation.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    select: { id: true, title: true, loanType: true, summaryResults: true, createdAt: true },
  });
  const items = rows.map(({ summaryResults, ...row }) => ({ ...row, summary: storedSummarySchema.parse(summaryResults) }));
  return Response.json({ items, limit, offset });
}
