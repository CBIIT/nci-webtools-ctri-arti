#!/usr/bin/env node
import { chromium } from "playwright";
import { promises as fs } from "fs";
import { join, extname } from "path";

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Capture all console output from client
page.on("console", (msg) => {
  const type = msg.type();

  if (type === "warning") {
    console.log(`[WARNING] ${msg.text()}`);
  } else if (type === "error") {
    console.log(`[ERROR] ${msg.text()}`);
  } else {
    // Handle objects properly instead of showing [Object, Object, Object]
    const args = msg.args();
    if (args.length > 0) {
      Promise.all(args.map((arg) => arg.jsonValue()))
        .then((values) => {
          const formattedValues = values.map((val) => (typeof val === "object" && val !== null ? JSON.stringify(val, null, 2) : val));
          console.log(formattedValues.join(" "));
        })
        .catch(() => {
          // Fallback to text if jsonValue fails
          console.log(msg.text());
        });
    } else {
      console.log(msg.text());
    }
  }
});

page.on("pageerror", (err) => console.error(`[ERROR] ${err.message}`));

// Route all requests to local files
await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());

  try {
    // Let external requests pass through
    if (url.hostname !== "localhost") {
      return route.continue();
    }

    // Special endpoint for test discovery
    if (url.pathname === "/dir.json") {
      const tests = await fs.readdir("./test", { recursive: true });
      const testFiles = tests.filter((f) => f.endsWith(".test.js"));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(testFiles),
      });
    }

    // Mock API endpoints for testing
    if (url.pathname === "/api/session") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            firstName: "Test User",
            email: "test@example.com",
            Role: { id: 1 },
          },
        }),
      });
    }

    // Mock model API endpoint
    if (url.pathname === "/api/model") {
      const method = route.request().method();

      if (method === "GET") {
        // Return available models
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([{ label: "Test Model", value: "test-model", maxContext: 8000, maxOutput: 2000 }]),
        });
      }

      if (method === "POST") {
        const body = route.request().postData();
        const request = JSON.parse(body || "{}");
        const { messages = [], tools = [], thoughtBudget = 0, stream = false } = request;

        // Get user message text
        const userMessage = messages[messages.length - 1];
        const userText = userMessage?.content?.find((c) => c.text)?.text || "";

        // Determine response behavior
        const shouldError = userText.includes("error");
        const shouldUseTool = tools.length > 0 && userText.includes("tool");
        const hasReasoning = thoughtBudget > 0;

        if (shouldError) {
          return route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Mock error triggered" }),
          });
        }

        const responseText = `Your message was: ${userText}`;

        if (stream) {
          // Create streaming response
          const events = [];

          // Message start
          events.push({ type: "messageStart", messageStart: { role: "assistant" } });

          let blockIndex = 0;

          // Add reasoning if requested
          if (hasReasoning) {
            events.push({ type: "contentBlockStart", contentBlockStart: { contentBlockIndex: blockIndex, start: {} } });
            events.push({
              type: "contentBlockDelta",
              contentBlockDelta: {
                contentBlockIndex: blockIndex,
                delta: { reasoningContent: { text: "Thinking about this request..." } },
              },
            });
            events.push({ type: "contentBlockStop", contentBlockStop: { contentBlockIndex: blockIndex } });
            blockIndex++;
          }

          // Add tool use or text response
          if (shouldUseTool) {
            events.push({
              type: "contentBlockStart",
              contentBlockStart: {
                contentBlockIndex: blockIndex,
                start: { toolUse: { toolUseId: "tool-123", name: "example_tool" } },
              },
            });
            events.push({
              type: "contentBlockDelta",
              contentBlockDelta: {
                contentBlockIndex: blockIndex,
                delta: { toolUse: { input: '{"action": "test"}' } },
              },
            });
            events.push({ type: "contentBlockStop", contentBlockStop: { contentBlockIndex: blockIndex } });
            events.push({ type: "messageStop", messageStop: { stopReason: "tool_use" } });
          } else {
            events.push({
              type: "contentBlockStart",
              contentBlockStart: { contentBlockIndex: blockIndex, start: { text: {} } },
            });
            events.push({
              type: "contentBlockDelta",
              contentBlockDelta: { contentBlockIndex: blockIndex, delta: { text: responseText } },
            });
            events.push({ type: "contentBlockStop", contentBlockStop: { contentBlockIndex: blockIndex } });
            events.push({ type: "messageStop", messageStop: { stopReason: "end_turn" } });
          }

          // Add usage metadata
          events.push({
            type: "metadata",
            metadata: {
              usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
              metrics: { latencyMs: 100 },
            },
          });

          return route.fulfill({
            status: 200,
            contentType: "text/plain",
            body: events.map((e) => JSON.stringify(e)).join("\n") + "\n",
          });
        } else {
          // Non-streaming response
          const response = {
            output: {
              message: {
                role: "assistant",
                content: shouldUseTool
                  ? [{ toolUse: { toolUseId: "tool-123", name: "example_tool", input: { action: "test" } } }]
                  : [{ text: responseText }],
              },
            },
            stopReason: shouldUseTool ? "tool_use" : "end_turn",
            usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
            metrics: { latencyMs: 100 },
          };

          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(response),
          });
        }
      }
    }

    // Generic test control API
    if (url.pathname === "/test.json") {
      const method = route.request().method();

      if (method === "GET") {
        // Return current test status/context
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "running",
            timestamp: Date.now(),
          }),
        });
      } else if (method === "POST") {
        // Handle test control commands (like logging network events)
        const postData = route.request().postData();
        try {
          const data = JSON.parse(postData || "{}");
          console.log(`[TEST-API] ${data.type || "event"}:`, data.message || JSON.stringify(data));

          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true }),
          });
        } catch (e) {
          return route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ error: "Invalid JSON" }),
          });
        }
      }
    }

    // Serve files
    const filePath = join(process.cwd(), url.pathname === "/" ? "/index.html" : url.pathname);
    const body = await fs.readFile(filePath);

    route.fulfill({
      status: 200,
      contentType: MIME_TYPES[extname(filePath)] || "application/octet-stream",
      body,
    });
  } catch (err) {
    route.fulfill({ status: 404, body: "Not found" });
  }
});

// Navigate to test page and inject network monitoring
console.log("Running tests...");
await page.goto("http://localhost/test.html", { waitUntil: "networkidle" });

// Inject minimal network monitoring
await page.addInitScript(() => {
  // Override fetch to track requests and log errors inline with tests
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = args[0];
    const currentTest = window.CURRENT_TEST;
    const requestId = Date.now() + Math.random();

    // Track pending requests during tests
    if (currentTest && url !== "/test.json") {
      window.PENDING_REQUESTS = window.PENDING_REQUESTS || new Set();
      window.PENDING_REQUESTS.add(requestId);
    }

    // Log invalid URLs with context
    if (url === undefined || url === "undefined" || url === null) {
      if (currentTest) {
        const caller = new Error().stack.split("\n")[2]?.trim() || "unknown";
        console.log(`[${currentTest.suite} > ${currentTest.test}] INVALID URL: ${url} (type: ${typeof url}) from ${caller}`);
      }
    }

    try {
      const response = await originalFetch(...args);

      // Log errors with detailed info
      if (currentTest && url !== "/test.json") {
        if (response.status >= 400) {
          const statusText = response.statusText || "Unknown";
          const headers = Object.fromEntries(response.headers.entries());
          console.log(`[${currentTest.suite} > ${currentTest.test}] HTTP ${response.status} ${statusText} - ${url}`);
          if (response.status === 404) {
            console.log(`[${currentTest.suite} > ${currentTest.test}] Request headers:`, JSON.stringify(headers, null, 2));
          }
        }
        window.PENDING_REQUESTS.delete(requestId);
      }

      return response;
    } catch (error) {
      // Log exceptions with full details
      if (currentTest && url !== "/test.json") {
        console.log(`[${currentTest.suite} > ${currentTest.test}] Fetch error: ${error.name}: ${error.message}`);
        console.log(`[${currentTest.suite} > ${currentTest.test}] URL: ${url} (type: ${typeof url})`);
        if (error.stack) {
          const relevantStack = error.stack.split("\n").slice(0, 3).join("\n");
          console.log(`[${currentTest.suite} > ${currentTest.test}] Stack: ${relevantStack}`);
        }
        window.PENDING_REQUESTS.delete(requestId);
      }

      throw error;
    }
  };

  // Log network activity inline with current test context
  const logNetwork = (message) => {
    const test = window.CURRENT_TEST;
    if (test) {
      console.log(`[${test.suite} > ${test.test}] ${message}`);
    }
  };

  // Intercept XMLHttpRequest with detailed error info
  const originalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new originalXHR();
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    let method, requestUrl;

    xhr.open = function (m, url, ...args) {
      method = m;
      requestUrl = url;
      return originalOpen.call(this, m, url, ...args);
    };

    xhr.send = function (...args) {
      xhr.addEventListener("error", () => {
        logNetwork(`XHR ${method} Error: ${requestUrl} - Status: ${xhr.status} ${xhr.statusText}`);
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 400) {
          logNetwork(`XHR ${method} ${xhr.status} ${xhr.statusText}: ${requestUrl}`);
        }
      });
      return originalSend.call(this, ...args);
    };

    return xhr;
  };

  // Catch resource loading errors with detailed context
  window.addEventListener(
    "error",
    (event) => {
      if (event.target !== window) {
        const target = event.target;
        const url = target.src || target.href;
        const tagName = target.tagName;
        if (url) {
          logNetwork(`${tagName} load error: ${url} - Type: ${target.type || "unknown"} - Message: ${event.message || "No details"}`);
        }
      }
    },
    true
  );
});

// Wait for tests to complete
await page.waitForFunction(() => window.TESTS_DONE === true, { timeout: 60000 });

// Get results and exit
const testFailures = await page.evaluate(() => window.TESTS_FAILED || 0);
console.log(`\nTests completed with ${testFailures} failure(s).`);

await browser.close();
process.exit(testFailures > 0 ? 1 : 0);
