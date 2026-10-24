// REQ-NFR-PERF2: First Contentful Paint < 1.2 s on standard broadband.
// Runs Lighthouse (desktop preset: 40 ms RTT, 10 Mbps, no CPU slowdown) against the
// production build several times and fails if the median FCP misses the budget.
// Needs `npm run build` first and a Chromium browser; set CHROME_PATH to use e.g. Edge.
// Remote mode: LH_URL audits a deployed URL (e.g. a Vercel preview) instead of a local
// server; VERCEL_AUTOMATION_BYPASS_SECRET is sent if Deployment Protection is on.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const PORT = Number(process.env.LH_PORT ?? 3200);
const URL = process.env.LH_URL ?? `http://localhost:${PORT}/`;
const BUDGET_MS = 1200;
const RUNS = Number(process.env.LH_RUNS ?? 3);

const server = process.env.LH_URL
  ? undefined
  : spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", String(PORT)], { stdio: "ignore" });
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const extraHeaders = bypass ? { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } : undefined;

// Trace-recording failures Lighthouse itself says to retry; anything else fails the run.
const TRANSIENT = new Set(["NO_NAVSTART", "NO_TRACING_STARTED", "NO_DCL", "NO_LCP"]);
const MAX_ATTEMPTS = 3;

async function audit(port, run) {
  const flags = { port, output: "html", onlyCategories: ["performance"], ...(extraHeaders && { extraHeaders }) };
  for (let attempt = 1; ; attempt++) {
    const result = await lighthouse(URL, flags, desktopConfig);
    const error = result.lhr.runtimeError;
    if (!error) return result;
    if (!TRANSIENT.has(error.code) || attempt === MAX_ATTEMPTS) {
      throw new Error(`Lighthouse run ${run} failed: ${error.code} ${error.message}`);
    }
    console.warn(`Run ${run}: ${error.code}, retrying (attempt ${attempt + 1} of ${MAX_ATTEMPTS})`);
  }
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(URL, { headers: extraHeaders })).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not start on ${URL}`);
}

let chrome;
try {
  await waitForServer();
  chrome = await chromeLauncher.launch({
    chromePath: process.env.CHROME_PATH,
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
  });

  const results = [];
  let lastReport = "";
  for (let run = 1; run <= RUNS; run++) {
    const result = await audit(chrome.port, run);
    const { audits, categories } = result.lhr;
    // Secondary metrics occasionally come back without a value; report them as empty rather than crash.
    const metric = (id) => audits[id]?.numericValue ?? null;
    const fcp = metric("first-contentful-paint");
    if (fcp === null) throw new Error(`Lighthouse run ${run} produced no First Contentful Paint`);
    const round = (value, digits = 0) => (value === null ? null : Number(value.toFixed(digits)));
    results.push({
      run,
      fcpMs: Math.round(fcp),
      lcpMs: round(metric("largest-contentful-paint")),
      tbtMs: round(metric("total-blocking-time")),
      cls: round(metric("cumulative-layout-shift"), 3),
      score: categories.performance.score === null ? null : Math.round(categories.performance.score * 100),
    });
    lastReport = result.report;
  }

  await mkdir(".lighthouse", { recursive: true });
  await writeFile(".lighthouse/report.html", lastReport);
  console.table(results);

  const fcps = results.map((r) => r.fcpMs).sort((a, b) => a - b);
  const median = fcps[Math.floor(fcps.length / 2)];
  const pass = median < BUDGET_MS;
  console.log(`Median FCP ${median} ms (budget < ${BUDGET_MS} ms): ${pass ? "PASS" : "FAIL"}`);
  console.log("Full report: .lighthouse/report.html");
  process.exitCode = pass ? 0 : 1;
} finally {
  await chrome?.kill();
  server?.kill();
}
