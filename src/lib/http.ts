import type { z } from "zod";

/** JSON error body used by every API response: { error, details? }. */
export function jsonError(status: number, error: string, init: ResponseInit = {}): Response {
  return Response.json({ error }, { ...init, status });
}

export function validationError(error: string, zodError: z.ZodError): Response {
  const details = zodError.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
  return Response.json({ error, details }, { status: 400 });
}

/**
 * Browsers send Origin on cross-site POSTs; reject any that don't match the host
 * serving the API. Requests without Origin (curl, server-to-server) pass.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function isJson(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase() === "application/json";
}

/** Reads the body as text, or returns null as soon as it exceeds `maxBytes`. */
export async function readLimitedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
