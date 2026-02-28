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
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  // eslint-disable-next-line no-undef
  await page.waitForFunction(() => window.TESTS_DONE === true, { timeout: 60 * 60 * 1000 });

  await browser.close();
  process.exit(hasErrors ? 1 : 0);
}
