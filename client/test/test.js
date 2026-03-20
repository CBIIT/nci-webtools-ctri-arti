const onlyNames = new Set(
  (new URLSearchParams(window.location.search).get("onlyNames") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const onlySubtests = new Set(
  (new URLSearchParams(window.location.search).get("onlySubtests") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const testFilter = window.__TEST_FILTER__ || { enabled: false, selectors: [] };

function normalizeTestPath(value = "") {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function matchesTestFile(testFile, selectorFile) {
  if (!selectorFile) {
    return true;
  }

  const test = normalizeTestPath(testFile);
  const selector = normalizeTestPath(selectorFile);
  return test === selector || test.endsWith(`/${selector}`) || test.endsWith(selector);
}

function matchesPath(path, selectorNames) {
  if (!selectorNames.length) {
    return true;
  }

  const length = Math.min(path.length, selectorNames.length);
  for (let i = 0; i < length; i++) {
    if (path[i] !== selectorNames[i]) {
      return false;
    }
  }
  return true;
}

function shouldSkipByTestFilter(file, path) {
  if (!testFilter.enabled) {
    return false;
  }

  return !testFilter.selectors.some(
    (selector) => matchesTestFile(file, selector.file) && matchesPath(path, selector.names)
  );
}

class TAP {
  constructor() {
    this.i = 0; // indent level
    this.n = 0; // top-level test number
    this.tests = []; // top-level tests
    this.totalTests = 0; // total test count
    this.totalPass = 0; // total passed tests
    this.totalSkip = 0; // total skipped tests
    this.totalTodo = 0; // total todo tests
  }

  log(s = "") {
    console.log("    ".repeat(this.i) + s);
  }

  test(name, opts, fn) {
    if (typeof opts === "function") {
      fn = opts;
      opts = {};
    }
    const file = window.__CURRENT_TEST_FILE__ || "";
    if (shouldSkipByTestFilter(file, [name])) {
      opts = { ...opts, skip: true };
    }
    if (onlyNames.size && !onlyNames.has(name)) {
      opts = { ...opts, skip: true };
    }
    this.tests.push({ name, opts, fn, file });
  }

  async runTest(name, opts, fn, num, file, path = [name]) {
    this.log(`# Subtest: ${name}`);
    this.i++;
    this.totalTests++;

    if (opts?.skip || opts?.todo) {
      this.log(`ok ${num} - ${name} # ${opts.skip ? "SKIP" : "TODO"}`);
      this.log(`  ---`);
      this.log(`  duration_ms: 0.000000`);
      this.log(`  ...`);
      this.i--;
      if (opts.skip) this.totalSkip++;
      else this.totalTodo++;
      return true;
    }

    const ctx = {
      n: 0,
      failed: false,
      hooks: { before: [], after: [], beforeEach: [], afterEach: [] },
      before: (fn) => ctx.hooks.before.push(fn),
      after: (fn) => ctx.hooks.after.push(fn),
      beforeEach: (fn) => ctx.hooks.beforeEach.push(fn),
      afterEach: (fn) => ctx.hooks.afterEach.push(fn),
      test: async (name, opts, fn) => {
        if (typeof opts === "function") {
          fn = opts;
          opts = {};
        }
        const childPath = [...path, name];
        if (shouldSkipByTestFilter(file, childPath)) {
          opts = { ...opts, skip: true };
        }
        if (onlySubtests.size && !onlySubtests.has(name)) {
          opts = { ...opts, skip: true };
        }
        ctx.n++;
        for (const h of ctx.hooks.beforeEach) await h();
        const ok = await this.runTest(name, opts, fn, ctx.n, file, childPath);
        if (!ok) ctx.failed = true;
        for (const h of ctx.hooks.afterEach) await h();
        return ok;
      },
    };

    const start = Date.now();
    let err;

    try {
      for (const h of ctx.hooks.before) await h();
      await fn(ctx);
      for (const h of ctx.hooks.after) await h();
    } catch (e) {
      err = e;
    }

    const ms = Date.now() - start;
    const ok = !err && !ctx.failed;
    if (ctx.n > 0) this.log(`1..${ctx.n}`);

    this.i--;

    // Only output result for nested tests (not top-level)
    if (this.i > 0) {
      this.log(`${ok ? "" : "not "}ok ${num} - ${name}`);
      this.log(`  ---`);
      this.log(`  duration_ms: ${ms.toFixed(6)}`);
      if (err) {
        this.log(`  failureType: 'testCodeFailure'`);
        this.log(`  error: |-`);
        err.message.split("\n").forEach((l) => this.log(`    ${l}`));
        this.log(`  code: 'ERR_TEST_FAILURE'`);
        this.log(`  stack: |-`);
        err.stack
          .split("\n")
          .slice(0, 3)
          .forEach((l) => this.log(`    ${l}`));
      } else if (ctx.failed) {
        this.log(`  failureType: 'subtestsFailed'`);
        this.log(`  error: |-`);
        this.log(`    One or more subtests failed.`);
        this.log(`  code: 'ERR_TEST_FAILURE'`);
      }
      this.log(`  ...`);
      if (ok) this.totalPass++;
    }

    return ok;
  }

  async run() {
    console.log("TAP version 13");
    const start = Date.now();

    for (const t of this.tests) {
      this.n++;
      const tstart = Date.now();
      const ok = await this.runTest(t.name, t.opts, t.fn, this.n, t.file, [t.name]);
      const ms = Date.now() - tstart;

      console.log(`${ok ? "ok" : "not ok"} ${this.n} - ${t.name}`);
      console.log(`  ---`);
      console.log(`  duration_ms: ${ms.toFixed(6)}`);
      console.log(`  type: 'test'`);
      console.log(`  ...`);

      if (ok && !t.opts?.skip && !t.opts?.todo) this.totalPass++; // count top-level test as passed
    }

    const ms = Date.now() - start;
    const fail = this.totalTests - this.totalPass - this.totalSkip - this.totalTodo;
    console.log(`1..${this.n}`);
    console.log(`# tests ${this.totalTests}`);
    console.log(`# suites 0`);
    console.log(`# pass ${this.totalPass}`);
    console.log(`# fail ${fail}`);
    console.log(`# cancelled 0`);
    console.log(`# skipped ${this.totalSkip}`);
    console.log(`# todo ${this.totalTodo}`);
    console.log(`# duration_ms ${ms.toFixed(6)}`);
    return {
      tests: this.totalTests,
      pass: this.totalPass,
      fail,
      skipped: this.totalSkip,
      todo: this.totalTodo,
      duration_ms: ms,
    };
  }
}

const tap = new TAP();
const test = tap.test.bind(tap);
test.skip = (name, fn) => tap.test(name, { skip: true }, fn);
test.todo = (name, fn) => tap.test(name, { todo: true }, fn);

export default test;
export const run = () => tap.run();
