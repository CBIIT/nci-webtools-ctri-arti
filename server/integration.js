import { chromium } from "playwright";

import { createApp, createServer } from "./server.js";

// import { env } from "./server.js";

const env = process.env;
const app = createApp(env);
createServer(app, env).listen(env.PORT, runTests);
// app.listen(env.PORT, runTests);

async function runTests({ PORT } = env) {
  const args = ["--ignore-certificate-errors"];
  const browser = await chromium.launch({ headless: true, args });
  const page = await browser.newPage();
  page.on("console", (msg) => console.log(msg.text()));
  await page.goto(`http://localhost:${PORT}/?test=1`, { waitUntil: "networkidle" });
  // eslint-disable-next-line no-undef
  await page.waitForFunction(() => window.TESTS_DONE === true, { timeout: 60 * 60 * 1000 });
  await browser.close();
  process.exit(0);
}
