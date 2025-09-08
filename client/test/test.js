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
    this.tests.push({ name, opts, fn });
  }

  async runTest(name, opts, fn, num) {
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
        ctx.n++;
        for (const h of ctx.hooks.beforeEach) await h();
        const ok = await this.runTest(name, opts, fn, ctx.n);
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
    if (ctx.n > 0) this.log(`1..${ctx.n}`);

    this.i--;

    // Only output result for nested tests (not top-level)
    if (this.i > 0) {
      this.log(`${err ? "not " : ""}ok ${num} - ${name}`);
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
      }
      this.log(`  ...`);
      if (!err) this.totalPass++;
    }

    return !err;
  }

  async run() {
    console.log("TAP version 13");
    const start = Date.now();

    for (const t of this.tests) {
      this.n++;
      const tstart = Date.now();
      const ok = await this.runTest(t.name, t.opts, t.fn, this.n);
      const ms = Date.now() - tstart;

      console.log(`${ok ? "ok" : "not ok"} ${this.n} - ${t.name}`);
      console.log(`  ---`);
      console.log(`  duration_ms: ${ms.toFixed(6)}`);
      console.log(`  type: 'test'`);
      console.log(`  ...`);

      if (ok) this.totalPass++; // count top-level test as passed
    }

    const ms = Date.now() - start;
    console.log(`1..${this.n}`);
    console.log(`# tests ${this.totalTests}`);
    console.log(`# suites 0`);
    console.log(`# pass ${this.totalPass}`);
    console.log(`# fail ${this.totalTests - this.totalPass - this.totalSkip - this.totalTodo}`);
    console.log(`# cancelled 0`);
    console.log(`# skipped ${this.totalSkip}`);
    console.log(`# todo ${this.totalTodo}`);
    console.log(`# duration_ms ${ms.toFixed(6)}`);
  }
}

const tap = new TAP();
const test = tap.test.bind(tap);
test.skip = (name, fn) => tap.test(name, { skip: true }, fn);
test.todo = (name, fn) => tap.test(name, { todo: true }, fn);

export default test;
export const run = () => tap.run();
