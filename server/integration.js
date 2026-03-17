import { chromium } from "playwright";

import { createApp, createServer } from "./server.js";

const env = process.env;
const app = await createApp(env);
createServer(app, env).listen(env.PORT, runTests);

async function runTests({
  PORT,
  TEST_URL,
  TEST_API_KEY,
  TEST_SLOW,
  TEST_PROFILE,
} = env) {
  const startedAt = Date.now();
  const browser = await chromium.launch({
    headless: true,
    args: ["--ignore-certificate-errors"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60 * 60 * 1000);

  const url =
    TEST_URL ||
    `http://localhost:${PORT}/?test=1` +
      (TEST_API_KEY ? `&apiKey=${encodeURIComponent(TEST_API_KEY)}` : "") +
      (TEST_SLOW === "1" ? "&slow=1" : "") +
      (TEST_PROFILE === "1" ? "&profile=1" : "");

  let failed = false;
  let coverageEntries;

  page.on("console", (msg) => console.log(msg.text()));
  page.on("pageerror", (error) => {
    console.error(error);
    failed = true;
  });
  page.on("requestfailed", (request) => {
    console.error(`Request failed: ${request.method()} ${request.url()} ${request.failure().errorText}`);
  });
  page.on("crash", () => {
    console.error("Page crashed");
    failed = true;
  });

  try {
    console.log("Starting browser JS coverage");
    await page.coverage.startJSCoverage({ reportAnonymousScripts: true });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    // eslint-disable-next-line no-undef
    await page.waitForFunction(() => window.TESTS_DONE === true, { timeout: 60 * 60 * 1000 });

    coverageEntries = await page.coverage.stopJSCoverage();
  } catch (error) {
    console.error(error);
    failed = true;
  } finally {
    await browser.close();
  }

  if (coverageEntries) {
    printCoverage(coverageEntries, url, env.TEST_COVERAGE_INCLUDE_TESTS === "1");
  }

  console.log(`Integration runtime: ${((Date.now() - startedAt) / 1000).toFixed(3)}s`);
  process.exit(failed ? 1 : 0);
}

function printCoverage(entries, baseUrl, includeTests) {
  const origin = new URL(baseUrl).origin;
  const files = entries
    .map((entry) => summarizeEntry(entry, origin, includeTests))
    .filter(Boolean)
    .sort((a, b) => a.path.localeCompare(b.path));

  if (!files.length) {
    return;
  }

  const totals = files.reduce(
    (all, file) => ({
      lines: all.lines + file.lines,
      coveredLines: all.coveredLines + file.coveredLines,
      funcs: all.funcs + file.funcs,
      coveredFuncs: all.coveredFuncs + file.coveredFuncs,
    }),
    { lines: 0, coveredLines: 0, funcs: 0, coveredFuncs: 0 }
  );

  const rows = [];
  let currentDir = null;
  for (const file of files) {
    const slash = file.path.lastIndexOf("/");
    const dir = slash === -1 ? "." : file.path.slice(0, slash);
    const name = slash === -1 ? file.path : file.path.slice(slash + 1);
    if (dir !== currentDir) {
      currentDir = dir;
      rows.push([dir, "", "", "", ""]);
    }

    rows.push([`  ${name}`, pct(file.coveredLines, file.lines), "n/a", pct(file.coveredFuncs, file.funcs), file.uncovered]);
  }

  renderTable(
    [
      { key: "file", width: 34 },
      { key: "line %", width: 6, align: "right" },
      { key: "branch %", width: 8, align: "right" },
      { key: "funcs %", width: 7, align: "right" },
      { key: "uncovered lines" },
    ],
    rows,
    [["all files", pct(totals.coveredLines, totals.lines), "n/a", pct(totals.coveredFuncs, totals.funcs), ""]]
  );
}

function summarizeEntry(entry, origin, includeTests) {
  if (!entry.url) return null;

  let url;
  try {
    url = new URL(entry.url);
  } catch {
    return null;
  }

  if (url.origin !== origin || url.pathname === "/" || entry.url.includes("node_modules")) return null;
  if (!includeTests && entry.url.includes("/test/")) return null;

  const source = entry.source || "";
  const lines = source.split("\n");
  const offsets = [0];
  for (const line of lines) offsets.push(offsets[offsets.length - 1] + line.length + 1);

  const executable = new Set();
  const covered = new Set();
  const uncovered = new Set();
  const functionNames = new Set();
  const coveredFunctionNames = new Set();

  for (const fn of entry.functions) {
    const informative = fn.ranges.filter((_, i) => !(i === 0 && !fn.functionName && fn.ranges[i].startOffset === 0 && fn.ranges[i].endOffset >= source.length));
    if (!informative.length) continue;

    if (fn.functionName) {
      functionNames.add(fn.functionName);
      if (informative.some((range) => range.count > 0)) coveredFunctionNames.add(fn.functionName);
    }

    for (const range of informative) {
      for (let i = 0; i < lines.length; i++) {
        if (range.startOffset >= offsets[i + 1] || range.endOffset <= offsets[i]) continue;
        executable.add(i + 1);
        if (range.count > 0) covered.add(i + 1);
        else uncovered.add(i + 1);
      }
    }
  }

  for (const line of covered) uncovered.delete(line);
  if (!executable.size) return null;

  return {
    path: url.pathname.replace(/^\//, ""),
    lines: executable.size,
    coveredLines: covered.size,
    funcs: functionNames.size,
    coveredFuncs: coveredFunctionNames.size,
    uncovered: compressRanges([...uncovered].sort((a, b) => a - b)),
  };
}

function pct(covered, total) {
  if (!total) return "";
  return ((100 * covered) / total).toFixed(2);
}

function compressRanges(lines) {
  if (!lines.length) return "";
  const ranges = [];
  let start = lines[0];
  let end = lines[0];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === end + 1) {
      end = lines[i];
      continue;
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    start = lines[i];
    end = lines[i];
  }

  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(" ");
}

function renderTable(columns, rows, footerRows = []) {
  const divider = `ℹ ${"-".repeat(totalTableWidth(columns))}`;
  console.log("");
  console.log(divider);
  console.log(renderTableRow(columns, columns.map((column) => column.key)));
  console.log(divider);
  for (const row of rows) {
    console.log(renderTableRow(columns, row));
  }
  if (footerRows.length) {
    console.log(divider);
    for (const row of footerRows) {
      console.log(renderTableRow(columns, row));
    }
  }
  console.log(divider);
  console.log("ℹ end of coverage report");
  console.log("");
}

function renderTableRow(columns, values) {
  return `ℹ ${columns
    .map((column, i) => alignCell(values[i] ?? "", column.width, column.align))
    .join(" | ")}`;
}

function alignCell(value, width, align = "left") {
  const text = String(value);
  if (!width) return text;
  return align === "right" ? text.padStart(width) : text.padEnd(width);
}

function totalTableWidth(columns) {
  return columns.reduce((width, column, i) => width + (column.width ?? 0) + (i ? 3 : 0), 0);
}
