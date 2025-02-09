import ivm from "isolated-vm";
import DDG from "duck-duck-scrape";
import { ProxyAgent } from "proxy-agent";
import { JSDOM } from "jsdom";
import { inspect } from "util";
import { parseDocument } from "./parsers.js";
import { runModel, DEFAULT_MODEL_ID, DEFAULT_SYSTEM_PROMPT } from "./inference.js";

const log = (value) => console.log(inspect(value, { depth: null, colors: true, compact: false, breakLength: 120 }));

const modelId = "amazon.nova-pro-v1:0";

const DEFAULT_TOOLS = {
  search: ddgSearch,
  runJavascript,
};

async function runTool(toolUse, tools = DEFAULT_TOOLS) {
  const { toolUseId, name, input } = toolUse;
  const content = [{ json: { results: (await tools?.[name]?.(input)) ?? null } }];
  return { toolUseId, content };
}

export async function researchV2({ topic }) {
  console.log(`\n[Starting research] Topic: ${topic}`);

  const state = {
    topic,
    steps: [],
    finalAnswer: null,
  };

  const TOOL_CONFIG = {
    tools: [
      {
        toolSpec: {
          name: "search",
          description: "Search for accurate, recent information",
          inputSchema: {
            json: {
              type: "object",
              properties: {
                keywords: { type: "string", description: "Search keywords with quotes for exact matches" },
                maxResults: { type: "number", description: "Optional. Results count (3-10)" },
              },
              required: ["keywords"],
            },
          },
        },
      },
      {
        toolSpec: {
          name: "runJavascript",
          description: "Execute JavaScript code for numerical calculations",
          inputSchema: {
            json: {
              type: "object",
              properties: {
                code: { type: "string", description: "JavaScript code that returns a value" },
              },
              required: ["code"],
            },
          },
        },
      },
    ],
  };

  const SYSTEM_PROMPT = `You are a research assistant that combines search with analysis to answer questions thoroughly and accurately.

GUIDELINES:
1. For each subquery, evaluate if you need external information (SEARCH) or can use current knowledge (ANSWER)
2. Break complex topics into atomic, focused subqueries building on previous findings
3. Search requirements:
   - Use for facts, current data, specific details
   - Cite sources in answers
   - Note any uncertainties
4. Calculations:
   - Use runJavascript for ALL math operations
   - Show work with code
5. Answers:
   - Clear and factual
   - Build on previous steps
   - Cite sources when using retrieved info
6. Final synthesis:
   - Integrate all findings
   - Address key aspects
   - Note confidence levels
   - Include relevant sources`;

  async function processToolUse(modelResponse, currentMessages) {
    console.log("\n[processToolUse] Processing tool response");

    if (!modelResponse.output?.message?.content) {
      console.log("No message content found");
      return modelResponse;
    }

    const toolUse = modelResponse.output.message.content.find((c) => c.toolUse)?.toolUse;
    if (!toolUse) {
      console.log("No tool use found in response");
      return modelResponse;
    }

    console.log(`Running tool: ${toolUse.name}`);
    const toolResult = await runTool(toolUse, { search, runJavascript });
    console.log("Tool execution complete");

    return runModel(
      modelId,
      [
        ...currentMessages,
        { role: "assistant", content: modelResponse.output.message.content },
        { role: "user", content: [{ toolResult }] },
      ],
      SYSTEM_PROMPT,
      TOOL_CONFIG
    );
  }

  async function runModelStep(prompt, currentState) {
    console.log("\n[runModelStep] Running model with prompt:", prompt.slice(0, 100) + "...");

    const messages = [
      ...currentState.steps.map((step) => ({
        role: "user",
        content: [{ text: step.prompt }],
      })),
      { role: "user", content: [{ text: prompt }] },
    ];

    let response = await runModel(modelId, messages, SYSTEM_PROMPT, TOOL_CONFIG);
    console.log(`Initial response stop reason: ${response.stopReason}`);

    if (response.stopReason === "tool_use") {
      console.log("Tool use detected, processing...");
      response = await processToolUse(response, messages);
    }

    return response;
  }

  async function generateSubquery(currentState) {
    console.log("\n[generateSubquery] Generating next subquery");

    const context = currentState.steps.map((s) => `Step ${s.index + 1}: ${s.subquery}\nFindings: ${s.answer}`).join("\n\n");

    const prompt = `Topic: "${currentState.topic}"
${currentState.steps.length > 0 ? `Previous findings:\n${context}\n\n` : ""}
Generate the next logical subquery to investigate, or respond COMPLETE if research is sufficient.
Each subquery should be specific and build on previous findings.`;

    const result = await runModelStep(prompt, currentState);
    const response = result.output.message?.content?.[0]?.text || "";
    console.log("Generated subquery:", response);
    return response.trim().toUpperCase() === "COMPLETE" ? null : response;
  }

  async function makeRetrievalDecision(subquery, currentState) {
    console.log("\n[makeRetrievalDecision] Deciding retrieval for:", subquery);

    const prompt = `Subquery: "${subquery}"
${
  currentState.steps.length > 0
    ? `Context: ${JSON.stringify(
        currentState.steps.map((s) => ({
          query: s.subquery,
          answer: s.answer,
        }))
      )}\n`
    : ""
}

Should this be answered with SEARCH or existing knowledge (ANSWER)?
Consider:
- Is this factual information needing verification?
- Does it require current/specific data?
- Can it be answered reliably with existing knowledge?

Reply only: SEARCH or ANSWER`;

    const result = await runModelStep(prompt, currentState);
    const decision = result.output.message?.content?.[0]?.text?.trim().toUpperCase() === "SEARCH";
    console.log("Decision:", decision ? "SEARCH" : "ANSWER");
    return decision;
  }

  async function getAnswer(subquery, shouldRetrieve, currentState) {
    console.log("\n[getAnswer] Getting answer for:", subquery);
    console.log("Retrieval needed:", shouldRetrieve);

    let context = "";

    if (shouldRetrieve) {
      console.log("Executing search...");
      const searchResults = await search({ keywords: subquery, maxResults: 3 });
      context = `Retrieved information:\n${JSON.stringify(searchResults)}\n`;
    }

    const prompt = `${subquery}
${context}
Provide a clear, specific answer.
- Cite sources if using retrieved information
- Use runJavascript for any calculations
- Build on previous findings if relevant`;

    const result = await runModelStep(prompt, currentState);
    const answer = result.output.message?.content?.[0]?.text || "";
    console.log("Answer generated:", answer.slice(0, 100) + "...");
    return answer;
  }

  async function generateFinalAnswer(currentState) {
    console.log("\n[generateFinalAnswer] Generating final synthesis");

    const prompt = `Topic: ${currentState.topic}

Research steps:
${currentState.steps.map((s) => `${s.index + 1}. ${s.subquery}\nFindings: ${s.answer}`).join("\n\n")}

Synthesize a comprehensive answer that:
1. Addresses the core topic
2. Integrates key findings
3. Notes uncertainties
4. Cites sources`;

    const result = await runModelStep(prompt, currentState);
    const finalAnswer = result.output.message?.content?.[0]?.text || "";
    console.log("Final answer generated:", finalAnswer.slice(0, 100) + "...");
    return finalAnswer;
  }

  let stepIndex = 0;
  while (stepIndex < 10) {
    console.log(`\n[Main Loop] Step ${stepIndex + 1}`);

    const subquery = await generateSubquery(state);
    if (!subquery) {
      console.log("No more subqueries needed, completing research");
      break;
    }

    const shouldRetrieve = await makeRetrievalDecision(subquery, state);
    const answer = await getAnswer(subquery, shouldRetrieve, state);

    state.steps.push({
      index: stepIndex++,
      subquery,
      usedRetrieval: shouldRetrieve,
      answer,
      prompt: `Q: ${subquery}\nA: ${answer}`,
    });
  }

  state.finalAnswer = await generateFinalAnswer(state);
  console.log(
    "\n[Research Complete] Final state:",
    JSON.stringify(
      {
        topic: state.topic,
        stepCount: state.steps.length,
        finalAnswerLength: state.finalAnswer.length,
      },
      null,
      2
    )
  );

  return state;
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
                  description:
                    "JavaScript code for data processing, analysis, or visualization. For example: 'const sum = 2 + 2; const product = 4 * 2; {sum, product};'",
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

/**
 * @param {Object} opts - Search options (q, count, offset, freshness, goggles)
 * @param {string} apiKey - Brave Search API key
 */
export async function braveSearch(opts, apiKey = process.env.BRAVE_SEARCH_API_KEY) {
  for (let key in opts) {
    if (opts[key] === undefined) {
      delete opts[key];
    }
  }
  Object.assign(opts, {
    summary: true,
    extra_snippets: true,
  });
  const url = `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams(opts)}`;
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.summarizer) {
    const opts = {
      key: data.summarizer.key,
    };
    const summarizerResponse = await fetch(`https://api.search.brave.com/res/v1/summarizer/search?${new URLSearchParams(opts)}`, {
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": apiKey,
      },
    });
    const summarizerData = await summarizerResponse.json();
    data.summary = summarizerData;
  }

  return data;
}

/**
 *
 * @param {*} param0
 * @returns
 */
export async function ddgSearch({ keywords, offset = 0, time, vqd }, env = process.env) {
  const { PROXY_SOURCE } = env;
  const response = await retry(10, 500, async () => {
    let agent;
    if (PROXY_SOURCE) {
      const parseProxies = (proxies) => {
        try {
          const results = JSON.parse(proxies);
          if (Array.isArray(results?.data)) {
            return results.data.map((proxy) => `${proxy.protocols[0]}://${proxy.ip}:${proxy.port}`);
          }
        } catch (error) {
          return proxies.split("\n");
        }
      };
      const proxyResponse = await fetch(PROXY_SOURCE).then((res) => res.text());
      const proxies = parseProxies(proxyResponse);
      let proxy = proxies[Math.floor(Math.random() * proxies.length)];
      // prepend protocol if missing (use https:// by default)
      if (!/.+:\/\//.test(proxy)) {
        proxy = `https://${proxy}`;
      }
      console.log("using some proxy", proxy);
      agent = new ProxyAgent(proxy);
    }
    return await DDG.search(keywords, { offset, time, vqd }, { agent });
  });
  const appendBody = async (result) => ({ ...result, body: await extractTextFromUrl(result.url) });
  const results = await Promise.all((response.results || []).map(appendBody));
  return { vqd, results };
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

/**
 * Retries a function with exponential backoff
 * @param {number} maxAttempts - Maximum number of retry attempts
 * @param {number} initialDelay - Initial delay in milliseconds
 * @param {Function} fn - Async function to retry
 * @returns {Promise<any>} - Result of the function execution
 * @throws {Error} - Throws the last error encountered after all retries are exhausted
 */
export async function retry(maxAttempts, initialDelay, fn) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt} failed:`, error);

      if (attempt === maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff: initialDelay * 2^(attempt-1)
      const delay = initialDelay * Math.pow(2, attempt - 1);

      // Add some jitter to prevent thundering herd problem
      const jitter = Math.random() * 100;

      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }

  throw new Error(`Failed after ${maxAttempts} attempts. Last error: ${lastError.message}`);
}
