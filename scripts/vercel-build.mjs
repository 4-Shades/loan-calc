// Vercel build (Slice 9). Vercel runs the "vercel-build" npm script instead of "build".
// Each Vercel environment has its own DATABASE_URL / DIRECT_URL (production vs the shared
// preview database, D18), so migrating here only ever touches that environment's database.
import { spawnSync } from "node:child_process";
import { missingDeployEnv } from "../src/lib/deployEnv.ts";

const missing = missingDeployEnv(process.env);
if (missing.length > 0) {
  console.error(`Missing environment variables for a Vercel deployment:\n  - ${missing.join("\n  - ")}`);
  console.error("Set them in the Vercel project for this environment (see README: Deploy to Vercel).");
  process.exit(1);
}

function run(command) {
  console.log(`\n> ${command}`);
  const result = spawnSync(command, { stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Deploying to Vercel environment: ${process.env.VERCEL_ENV ?? "unknown"}`);
run("npx prisma migrate deploy"); // uses DIRECT_URL via prisma.config.ts
run("npm run build");
