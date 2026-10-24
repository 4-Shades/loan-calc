// Vercel build (Slice 9). Vercel runs the "vercel-build" npm script instead of "build".
// Each deployment gets its own Neon connection strings (the production branch, or the
// preview/<git-branch> branch the Neon integration creates, D18), so migrating here only
// ever touches that deployment's database.
import { spawnSync } from "node:child_process";
import { missingDeployEnv } from "../src/lib/deployEnv.ts";

const missing = missingDeployEnv(process.env);
if (missing.length > 0) {
  console.error(`Vercel deployment is not configured correctly:\n  - ${missing.join("\n  - ")}`);
  console.error("Set them in the Vercel project for this environment (see README: Deploy to Vercel).");
  process.exit(1);
}

function run(command) {
  console.log(`\n> ${command}`);
  const result = spawnSync(command, { stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Deploying to Vercel environment: ${process.env.VERCEL_ENV ?? "unknown"}`);
run("npm run db:migrate"); // direct URL: DIRECT_URL or DATABASE_URL_UNPOOLED
run("npm run build");
