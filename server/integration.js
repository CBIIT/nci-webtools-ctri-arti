import { chromium } from "playwright";

import { createApp, createServer } from "./server.js";

const env = process.env;
const app = await createApp(env);
createServer(app, env).listen(env.PORT, runTests);
// app.listen(env.PORT, runTests);

async function runTests({ PORT, TEST_URL, TEST_API_KEY } = env) {
  const args = ["--ignore-certificate-errors"];
  const browser = await chromium.launch({ headless: true, args });
  const context = await browser.newContext();
  context.setDefaultTimeout(60 * 60 * 1000); // 60 minutes
  const page = await context.newPage();
  const apiKeyParam = TEST_API_KEY ? `&apiKey=${TEST_API_KEY}` : "";
  const url = TEST_URL || `http://localhost:${PORT}/?test=1${apiKeyParam}`;
  let hasErrors = false;
  page.on("console", (msg) => console.log(msg.text()));
  page.on("pageerror", (err) => {
    console.error(err);
    hasErrors = true;
  });
  page.on("requestfailed", (req) => {
    console.error(`Request failed: ${req.method()} ${req.url()} ${req.failure().errorText}`);
  });
  page.on("crash", () => {
    console.error("Page crashed");
    hasErrors = true;
  });

  await page.coverage.startJSCoverage({ reportAnonymousScripts: true });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  // eslint-disable-next-line no-undef
  await page.waitForFunction(() => window.TESTS_DONE === true, { timeout: 60 * 60 * 1000 });

  reportCoverage(await page.coverage.stopJSCoverage(), url);
  await browser.close();
  process.exit(hasErrors ? 1 : 0);
}

function reportCoverage(entries, baseUrl) {
  const origin = new URL(baseUrl).origin;
  // Filter to our own client source files (exclude CDN, test harness, node_modules)
  const ours = entries.filter(
    (e) => e.url.startsWith(origin) && !e.url.includes("/test/") && !e.url.includes("node_modules")
  );
  if (!ours.length) return;

  console.log("\n── JS Coverage ──────────────────────────────────────────");
  let totalLines = 0;
  let totalCovered = 0;
  const uncoveredFns = [];

  for (const entry of ours) {
    const lines = entry.source.split("\n");
    const n = lines.length;
    // Build offset table: offsets[i] = byte offset of start of line i
    const offsets = [0];
    for (let i = 0; i < n; i++) offsets.push(offsets[i] + lines[i].length + 1);

    const uncoveredLines = new Set();
    for (const fn of entry.functions) {
      for (const range of fn.ranges) {
        if (!range.count) {
          for (let i = 0; i < n; i++) {
            if (range.startOffset < offsets[i + 1] && range.endOffset > offsets[i]) {
              uncoveredLines.add(i);
            }
          }
        }
      }
      if (fn.functionName && fn.ranges.every((r) => !r.count)) {
        uncoveredFns.push({ file: entry.url.replace(origin, ""), name: fn.functionName });
      }
    }

    const covered = n - uncoveredLines.size;
    const pct = ((100 * covered) / n).toFixed(1);
    const short = entry.url.replace(origin, "");
    console.log(`  ${short}: ${covered}/${n} lines (${pct}%)`);
    totalLines += n;
    totalCovered += covered;
  }

  const totalPct = ((100 * totalCovered) / totalLines).toFixed(1);
  console.log(`\n  Total: ${totalCovered}/${totalLines} lines (${totalPct}%)`);

  if (uncoveredFns.length) {
    console.log(`\n  Uncovered functions (${uncoveredFns.length}):`);
    for (const { file, name } of uncoveredFns) console.log(`    ${file}: ${name}`);
  }
  console.log("─────────────────────────────────────────────────────────\n");
}
