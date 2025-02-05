import ivm from "isolated-vm";
import { JSDOM } from "jsdom";
import { inspect } from "util";
import { parseDocument } from "./parsers.js";
import { runModel, DEFAULT_MODEL_ID, DEFAULT_SYSTEM_PROMPT } from "./inference.js";

const log = (value) => console.log(inspect(value, { depth: null, colors: true, compact: false, breakLength: 120 }));

const DEFAULT_TOOLS = {
  search,
  runJavascript,
};

async function runTool(toolUse, tools = DEFAULT_TOOLS) {
  const { toolUseId, name, input } = toolUse;
  const content = [{ json: { results: (await tools?.[name]?.(input)) ?? null } }];
  return { toolUseId, content };
}

/**
 * Uses search + an llm model to research a topic
 * @param {string} topic - The topic to research
 */
export async function research({ topic }) {
  const modelId = "amazon.nova-pro-v1:0";
  const prompt = `Research the following topic: ${topic}

Expected deliverables:
1. Executive summary (2-3 sentences)
2. Key findings (organized by theme)
3. Supporting evidence and data
4. Analysis and implications
5. References with brief source credibility notes`;

  const messages = [{ role: "user", content: [{ text: prompt }] }];
  const system = `You are a research assistant that combines web search with JavaScript analysis. Please follow these guidelines:

1. Use runJavascript for:
   - All calculations and arithmetic
   - Data processing
   - Statistical analysis
   - Working with arrays and objects
   
2. Use search for:
   - Finding facts and information
   - Current events
   - Expert analysis
   - Documentation
   
3. Response Format:
   - Show your work with code when using calculations
   - Include sources when citing information
   
4. Tool Selection:
   - Numbers or calculations → runJavascript
   - Information gathering → search
   - Complex tasks may need both tools

Note: Please use runJavascript for all mathematical operations, including basic arithmetic.`;
  const toolConfig = {
    tools: [
      {
        toolSpec: {
          name: "search",
          description: "Search the internet for accurate, recent information",
          inputSchema: {
            json: {
              type: "object",
              properties: {
                keywords: {
                  type: "string",
                  description: "Search keywords - use quotes for exact matches and boolean operators (AND, OR) for complex queries",
                },
                maxResults: {
                  type: "number",
                  description: "Optional. Maximum number of results (5-20 recommended)",
                },
              },
              required: ["keywords"],
            },
          },
        },
      },
      {
        toolSpec: {
          name: "runJavascript",
          description: "Execute JavaScript code for data analysis",
          inputSchema: {
            json: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  description: "JavaScript code for data processing, analysis, or visualization. For example: 'const sum = 2 + 2; sum;'",
                },
              },
              required: ["code"],
            },
          },
        },
      },
    ],
  };
  let results, toolUse;

  do {
    results = await runModel(modelId, messages, system, toolConfig);
    const message = results.output.message;
    messages.push(message);
    // log(results);

    if (results.stopReason === "tool_use") {
      const toolUse = message.content.at(-1)?.toolUse ?? null;
      const toolResult = await runTool(toolUse);
      // log(toolResult.content[0].json.results);
      messages.push({ role: "user", content: [{ toolResult }] });
      // log(messages);
    }
  } while (results.stopReason !== "end_turn");

  return messages;
}

export async function search({ keywords, maxResults = 10 }) {
  const results = [];
  let formData = new URLSearchParams();
  formData.append("q", keywords);

  while (results.length < maxResults) {
    const response = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      body: formData,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Get results
    const elements = document.querySelectorAll("#links .web-result");
    const pageResults = [];

    for (const el of elements) {
      if (results.length >= maxResults) break;

      const titleEl = el.querySelector(".result__title");
      const snippetEl = el.querySelector(".result__snippet");
      const linkEl = el.querySelector(".result__url");

      if (titleEl && linkEl) {
        const ddgUrl = new URL(linkEl.href, "https://duckduckgo.com");
        const realUrl = ddgUrl.pathname === "/l/" ? new URLSearchParams(ddgUrl.search).get("uddg") : linkEl.href;

        pageResults.push({
          title: titleEl?.textContent?.trim(),
          url: decodeURIComponent(realUrl),
          snippet: snippetEl?.textContent?.trim(),
          // headers: Object.fromEntries(response.headers),
        });
      }
    }

    // Fetch all page contents in parallel
    const processedResults = await Promise.all(
      pageResults.map(async (result) => ({
        ...result,
        body: await extractTextFromUrl(result.url),
      }))
    );

    results.push(...processedResults);

    // Get next page data
    const form = document.querySelector("#links form");
    if (!form) break;

    formData = new URLSearchParams();
    form.querySelectorAll("input").forEach((input) => {
      formData.append(input.name, input.value);
    });

    if (!form || elements.length === 0) break;
  }

  return results;
}

async function extractTextFromUrl(url, expandUrls = false) {
  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type").split(";")[0].toLowerCase();

    // Get the response as ArrayBuffer to handle both text and binary
    const buffer = await response.arrayBuffer();

    // Handle HTML pages
    if (contentType.includes("text/html")) {
      const html = new TextDecoder().decode(buffer);
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      // Remove unwanted elements
      ["script", "style", "nav", "header", "footer", "noscript"].forEach((tag) => {
        doc.querySelectorAll(tag).forEach((el) => el.remove());
      });

      // Expand URLs if requested
      if (expandUrls) {
        doc.querySelectorAll("a").forEach((el) => {
          el.textContent = `[${el.href}] ${el.textContent}`;
        });
      }

      return doc.body.textContent.replace(/\s+/g, " ").trim();
    } else {
      return parseDocument(buffer, contentType);
    }
  } catch (error) {
    console.error(`Failed to extract text from ${url}:`, error);
    return "";
  }
}

export async function runJavascript({ code, globalContext = {}, memoryLimit = 128 }) {
  const isolate = new ivm.Isolate({ memoryLimit });
  const context = await isolate.createContext();
  const jail = context.global;
  for (const key in globalContext) {
    await jail.set(key, globalContext[key], { copy: true });
  }
  const script = await isolate.compileScript(String(code));
  return await script.run(context);
}
