import { connection } from "next/server";
import { getPrisma } from "@/lib/db";

/** Liveness plus database reachability, for container health checks. */
export async function GET(): Promise<Response> {
  // Always run at request time: never prerender a health check at build.
  await connection();
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok" });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
