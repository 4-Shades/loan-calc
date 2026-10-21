// REQ-NFR-PERF2: First Contentful Paint < 1.2 s on standard broadband.
// Runs Lighthouse (desktop preset: 40 ms RTT, 10 Mbps, no CPU slowdown) against the
// production build several times and fails if the median FCP misses the budget.
// Needs `npm run build` first and a Chromium browser; set CHROME_PATH to use e.g. Edge.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const PORT = Number(process.env.LH_PORT ?? 3200);
const URL = `http://localhost:${PORT}/`;
const BUDGET_MS = 1200;
const RUNS = Number(process.env.LH_RUNS ?? 3);

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", String(PORT)], {
  stdio: "ignore",
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(URL)).ok) return;
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
    const result = await lighthouse(URL, { port: chrome.port, output: "html", onlyCategories: ["performance"] }, desktopConfig);
    const audits = result.lhr.audits;
    results.push({
      run,
      fcpMs: Math.round(audits["first-contentful-paint"].numericValue),
      lcpMs: Math.round(audits["largest-contentful-paint"].numericValue),
      tbtMs: Math.round(audits["total-blocking-time"].numericValue),
      cls: Number(audits["cumulative-layout-shift"].numericValue.toFixed(3)),
      score: Math.round(result.lhr.categories.performance.score * 100),
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
  server.kill();
}
