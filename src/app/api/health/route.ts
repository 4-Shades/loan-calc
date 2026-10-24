import { connection } from "next/server";
import { ping } from "@/lib/calculationsRepo";
import { getPool } from "@/lib/db";

/** Liveness plus database reachability, for container health checks. */
export async function GET(): Promise<Response> {
  // Always run at request time: never prerender a health check at build.
  await connection();
  try {
    await ping(getPool());
    return Response.json({ status: "ok", database: "ok" });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
