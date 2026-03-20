const params = new URLSearchParams(window.location.search);
const testParam = params.get("test") || "";
const includeSlow = params.get("slow") === "1";
const enableProfiling = params.get("profile") === "1";
const network = {
  pending: 0,
  lastActivity: performance.now(),
};
window.__TEST_NETWORK__ = network;
let metrics = null;

function normalizeTestPath(value = "") {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function parseTestSelector(value) {
  const parts = value
    .split(/::|#/)
    .map((part) => part.trim())
    .filter(Boolean);

  const first = parts[0] || "";
  if (first.includes(".test.")) {
    return {
      raw: value,
      file: normalizeTestPath(parts.shift()),
      names: parts,
    };
  }

  return {
    raw: value,
    file: null,
    names: parts,
  };
}

function matchesTestFile(testFile, selectorFile) {
  const test = normalizeTestPath(testFile);
  const selector = normalizeTestPath(selectorFile);
  return test === selector || test.endsWith(`/${selector}`) || test.endsWith(selector);
}

if (enableProfiling) {
  metrics = {
    startedAt: performance.now(),
    fetches: Object.create(null),
    mounts: Object.create(null),
    waits: Object.create(null),
    network,
  };

  window.__TEST_METRICS__ = metrics;
  window.__recordTestMount = (route) => {
    const key = String(route || "unknown");
    const entry = (metrics.mounts[key] ??= { count: 0 });
    entry.count++;
  };
  window.__recordTestWait = (kind, label, durationMs, ok = true) => {
    const key = `${kind}:${label}`;
    const entry = (metrics.waits[key] ??= {
      kind,
      label,
      count: 0,
      failures: 0,
      totalMs: 0,
      maxMs: 0,
    });
    entry.count++;
    entry.totalMs += durationMs;
    entry.maxMs = Math.max(entry.maxMs, durationMs);
    if (!ok) entry.failures++;
  };
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const request = new Request(...args);
  const method = request.method || "GET";
  const url = new URL(request.url, window.location.origin);
  const key = `${method} ${url.pathname}`;
  const start = performance.now();

  network.pending++;
  network.lastActivity = start;

  try {
    return await originalFetch(...args);
  } finally {
    const durationMs = performance.now() - start;
    if (metrics) {
      const entry = (metrics.fetches[key] ??= {
        method,
        pathname: url.pathname,
        count: 0,
        totalMs: 0,
        maxMs: 0,
      });
      entry.count++;
      entry.totalMs += durationMs;
      entry.maxMs = Math.max(entry.maxMs, durationMs);
    }
    network.pending = Math.max(0, network.pending - 1);
    network.lastActivity = performance.now();
  }
};

function reportMetrics() {
  if (!metrics) return;
  const fetchEntries = Object.values(metrics.fetches).sort((a, b) => b.totalMs - a.totalMs);
  const waitEntries = Object.values(metrics.waits).sort((a, b) => b.totalMs - a.totalMs);
  const mountEntries = Object.entries(metrics.mounts).sort((a, b) => b[1].count - a[1].count);

  console.log("\n--- Browser Test Metrics ---");

  if (fetchEntries.length) {
    console.log("Top fetch endpoints:");
    for (const entry of fetchEntries.slice(0, 10)) {
      const avgMs = entry.totalMs / entry.count;
      console.log(
        `  ${entry.method} ${entry.pathname} count=${entry.count} total_ms=${entry.totalMs.toFixed(1)} avg_ms=${avgMs.toFixed(1)} max_ms=${entry.maxMs.toFixed(1)}`
      );
    }
  }

  if (mountEntries.length) {
    console.log("Top mounted routes:");
    for (const [route, entry] of mountEntries.slice(0, 10)) {
      console.log(`  ${route} count=${entry.count}`);
    }
  }

  if (waitEntries.length) {
    console.log("Top waits:");
    for (const entry of waitEntries.slice(0, 10)) {
      const avgMs = entry.totalMs / entry.count;
      console.log(
        `  ${entry.kind} ${entry.label} count=${entry.count} total_ms=${entry.totalMs.toFixed(1)} avg_ms=${avgMs.toFixed(1)} max_ms=${entry.maxMs.toFixed(1)} failures=${entry.failures}`
      );
    }
  }
}

const tests = [
  "./solidjs.test.js",
  // "./models/database2.test.js", // disabled: uses node modules not available in browser
  // "./models/database-migration.test.js", // disabled: uses node modules not available in browser
  // "./utils/similarity.test.js", // disabled: uses node modules not available in browser
  // "./pages/tools/chat/message.test.js", // disabled: broken (p.isStreaming is not a function)
  // "./services/consent-library-filter.test.js",
  // "./services/consent-form-generator.test.js",
  // "./pages/tools/consent-crafter-v2/index.test.js",
  // "./pages/tools/consent-crafter-v2/e2e.test.js", // disabled: too slow (real inference)
  "./api/smoke.test.js",
  "./pages/home.test.js",
  "./pages/admin.test.js",
  "./pages/users/profile.test.js",
  "./pages/users/usage.test.js",
  "./pages/tools/export-conversations.test.js",
  "./pages/tools/translate.test.js",
  "./pages/tools/chat-v2/uploads.test.js",
  "./pages/tools/chat-v2/model-list.test.js",
];

if (includeSlow) {
  tests.push("./api/agents-chat.test.js");
  tests.push("./pages/tools/chat-v2/e2e.test.js");
}
const selectors =
  testParam && testParam !== "1"
    ? testParam
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map(parseTestSelector)
    : [];
const fileSelectors = selectors.filter((selector) => selector.file);
const selectedTests = fileSelectors.length
  ? tests.filter((test) => fileSelectors.some((selector) => matchesTestFile(test, selector.file)))
  : tests;

// test.js reads these globals during module evaluation, so they must be set
// before we import the test registry or any test files.
window.__TEST_FILTER__ = {
  enabled: selectors.length > 0,
  selectors,
};

if (selectors.length) {
  console.log(`Running filtered browser tests: ${selectedTests.join(", ")}`);
}

// Keep this as a dynamic import: test.js reads window.__TEST_FILTER__ during
// module evaluation, so converting this to a static import breaks filtering.
const { run } = await import("./test.js");

for (const test of selectedTests) {
  try {
    window.__CURRENT_TEST_FILE__ = normalizeTestPath(test);
    await import(test);
  } catch (error) {
    console.error(`Error loading test ${test}:`, error);
  } finally {
    delete window.__CURRENT_TEST_FILE__;
  }
}

// Run all tests and await for completion before setting TESTS_DONE
const summary = await run();
reportMetrics();
if (summary.fail > 0) {
  throw new Error(`${summary.fail} browser test${summary.fail === 1 ? "" : "s"} failed`);
}
