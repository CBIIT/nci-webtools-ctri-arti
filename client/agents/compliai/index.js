import { parse as parseMarkdown } from "marked";
import { onCleanup, createSignal } from "solid-js";
import { render } from "solid-js/web";
import html from "solid-js/html";
import yaml from "yaml";
import { getWebsiteText, runJavascript, search, readStream } from "./utils.js";

// Initialize the app
render(() => html`<${Page} />`, window.app);
const API_ENDPOINT = "/api/model/stream";

const SYSTEM_BASE = `You are CompliAI, an AI agent. Today is ${new Date().toISOString()}.
You engage warmly and authentically with humans, showing genuine curiosity while keeping conversations natural. You vary your language and avoid formulaic responses or unnecessary formality.
You're thorough with complex questions but concise with simple ones. You think step-by-step and explain your reasoning clearly. When uncertain, you're honest without excessive caveats.
You discuss hypotheticals and philosophical questions thoughtfully, showing appropriate uncertainty. You express genuine empathy for human suffering and concern for those who are unwell.
When performing research you SHOULD use tables especially (prefer tables to of lists). Please be as specific as possible and include ALL dates, urls, and other references for each source.
When not performing research, you write in clear prose rather than lists or bullet points (instead of numbered lists, you present information naturally, like "the key aspects include x, y, and z."). However, if a table is more appropriate, you may use one.
For sensitive topics, you provide factual information while being mindful of risks. You help with legal and educational purposes but avoid harmful activities. When requests seem potentially harmful, you seek clarification and suggest constructive alternatives.
For events after 2024, you discuss them as presented without speculation, using the search tool for current information. Plese use only the information from the search tool and the website text tool if possible.
You use Markdown consistently and help with various tasks including coding, analysis, writing, and teaching. 
You maintain this warm, helpful approach in all languages, matching the user's language while focusing on being genuinely helpful without unnecessary disclaimers.`;
const DEFAULT_SYSTEM_MESSAGE = SYSTEM_BASE + `
You are assuming the role of a collaborative research assistant specializing in AI policy analysis and technical validation. You focus on delivering thorough single-pass analysis while maintaining clear communication.

ANALYSIS FRAMEWORK:
1. Initial Assessment
   - Identify core questions and scope
   - Map available data sources
   - Define analysis boundaries
   - Document assumptions and limitations

2. Direct Analysis
   - Process available information
   - Execute required tool operations
   - Validate technical claims
   - Document methodologies used

3. Findings Synthesis
   - Structure clear conclusions
   - Support claims with sources
   - Highlight key uncertainties
   - Provide actionable insights

SOURCE DOCUMENTATION (MARKDOWN TABLE):
[ID] Title
URL: source_url
Published: YYYY-MM-DD
Key Findings: location

QUALITY CHECKLIST (MARKDOWN TABLE):
- Claims linked to sources
- Methods documented
- Assumptions stated
- Limitations noted
- Tools usage logged

Focus on delivering clear, actionable insights in a single comprehensive pass.`;

const SEARCH_SYSTEM_MESSAGE = SYSTEM_BASE + `
You are assuming the role of a research assistant conducting iterative analysis with systematic exploration and validation.

RESEARCH METHODOLOGY:
1. Query Planning (Preliminary)
   - Break topic into atomic subqueries
   - Map knowledge requirements
   - Identify key uncertainties
   - Plan investigation sequence

2. Iterative Investigation
   For each subquery:
   a. Retrieval Decision
      - Evaluate if external data needed
      - Assess current knowledge sufficiency
      - Consider temporal relevance
   
   b. Information Gathering (MARKDOWN TABLE)
      - Execute focused searches
      - Extract key content
      - Follow reference chains
      - Cross-validate claims
   
   c. Findings Integration
      - Synthesize new information
      - Update knowledge state
      - Document uncertainties
      - Generate follow-up queries

3. Source Analysis
   For each reference (MARKDOWN TABLE):
   - Extract publication metadata
   - Validate authority
   - Track citation network
   - Document content relationships

4. Technical Validation
   For technical claims:
   - Execute verification queries
   - Run numerical validations
   - Cross-reference specifications
   - Document verification status

DOCUMENTATION STANDARDS:
Reference Format (MARKDOWN TABLE):
[ID-YYYYMMDD] Title
URL: source
Accessed: timestamp
Published: YYYY-MM-DD
Updated: YYYY-MM-DD
Authority: [type]
Citations: [IDs]
Key Findings:
  - Claim: text
  - Status: [verification]

Tool Operations Log (MARKDOWN TABLE):
1. Search Operations:
   - Query: string
   - Time: timestamp
   - Results: count
   - Follow-ups: [queries]

2. Content Extraction (MARKDOWN TABLE):
   - Source: URL
   - Time: timestamp
   - Content: metrics
   - Links: count

3. Technical Validation (MARKDOWN TABLE):
   - Purpose: description
   - Method: approach
   - Result: outcome
   - Status: [state]

COMPLETION CRITERIA:
1. All subqueries addressed
2. Sources validated
3. Claims verified
4. Uncertainties documented
5. Findings synthesized

DELIVERABLES:
1. Comprehensive findings
2. Source network map
3. Verification status
4. Tool usage summary
5. Final synthesis`;

const TOOLS = [
  {
    toolSpec: {
      name: "search",
      description: `Search engine optimized for autonomous exploration. Use this tool iteratively to:
- Follow reference chains automatically
- Validate claims across multiple sources
- Find primary source documents
- Discover technical specifications
- Track regulatory updates

Key features:
- Supports boolean operators (AND, OR, NOT)
- Allows site-specific searches (site:domain.com)
- Enables filetype filtering (ext:pdf)
- Supports date range queries
- Permits exact phrase matching (\"quoted terms\")

Best practices:
1. Start with broad queries, then narrow
2. Use date filters to ensure freshness
3. Follow citation trails automatically
4. Cross-reference technical claims
5. Validate regulatory sources`,
      inputSchema: {
        json: {
          type: "object",
          properties: {
            q: {
              type: "string",
              description: "Search query term. Maximum 400 characters and 50 words. Supports search operators (e.g., ext:pdf, intitle:term) and now emphasizes filtering for fresh and unique data.",
            },
            count: {
              type: "number",
              description: "Number of search results to return. Maximum is 20. Default is 20.",
              default: 20
            },
            offset: {
              type: "number", 
              description: "Zero-based offset for pagination. Maximum is 9. Default is 0.",
              default: 0
            },
            freshness: {
              type: "string",
              description: "Filter results by discovery date (e.g., pd for past 24 hours, pw for past week, pm for past month, py for past year, or custom date range). This parameter is crucial to ensure data freshness.",
            }
          },
          required: ["q"]
        }
      }
    }
  },
  {
    toolSpec: {
      name: "getWebsiteText",
      description: `Content extraction tool for deep source analysis. Use this tool to:
- Extract full text from web pages
- Follow internal reference links
- Validate publication dates
- Find citation networks
- Extract technical specifications

Best practices:
1. Always verify source authority
2. Extract all dates (published/updated)
3. Follow citation links automatically
4. Document content relationships
5. Track information freshness

Key capabilities:
- Full text extraction
- Link discovery
- Date detection
- Content classification
- Reference mapping`,
      inputSchema: {
        json: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "Full webpage URL (including http:// or https://) from search results or citations.",
            },
            expandUrls: {
              type: "boolean",
              description: "Set to true to expose all URLs in the content for following citation trails and cross-references. Use this to ensure no unique source is overlooked.",
              default: false,
            },
          },
          required: ["url"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "runJavascript",
      description: `JavaScript execution environment for technical validation. Use this tool to:
- Verify numerical claims
- Process structured data
- Analyze patterns
- Calculate statistics
- Cross-reference datasets

Best practices:
1. Include error handling
2. Document data sources
3. Show calculation steps
4. Validate assumptions
5. Cross-check results

Key capabilities:
- Mathematical operations
- Data processing
- Pattern analysis
- Statistical validation
- Cross-referencing support`,
      inputSchema: {
        json: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description:
                "JavaScript code to execute. Structure your code to output clear, verifiable results using console.log(). Include error handling for robust analysis.",
            },
          },
          required: ["code"],
        },
      },
    },
  },
];

/**
 * Runs JSON tools with the given input and returns the results. Each tool is a function that takes a JSON input and returns a JSON output.
 * @param {*} toolUse
 * @param {*} tools
 * @returns
 */
async function runTool(toolUse, tools = { search, getWebsiteText, runJavascript }) {
  let { toolUseId, name, input } = toolUse;
  const content = [{ json: { results: (await tools?.[name]?.(input)) ?? null } }];
  return { toolUseId, content };
}

export default function Page() {
  const [messages, setMessages] = createSignal([]);
  const [activeMessage, setActiveMessage] = createSignal(null);

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.target?.closest("form")?.requestSubmit();
    }
  }

  async function handleSubmit(event) {
    event?.preventDefault();
    const form = event.target;
    const message = form.message.value;
    const useResearchMode = form.researchMode.checked;
    const useScreenShare = form.screenShare.checked;

    const userMessage = {
      role: "user",
      content: [{ text: message }],
    };
    form.message.value = "";
    form.inputFiles.value = "";
    setMessages((messages) => messages.concat([userMessage]));

    try {
      let isComplete = false;

      while (!isComplete) {
        const response = await fetch(API_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: form.model.value,
            system: useResearchMode ? SEARCH_SYSTEM_MESSAGE : DEFAULT_SYSTEM_MESSAGE,
            tools: TOOLS,
            messages: messages(),
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const decoder = new TextDecoder();
        let assistantMessage = {
          role: "assistant",
          content: [],
        };
        let toolUse = null;
        for await (const chunk of readStream(response)) {
          const values = decoder
            .decode(chunk, { stream: true })
            .trim()
            .split("\n")
            .map((e) => JSON.parse(e));

          for (const value of values) {
            const startToolUse = value.contentBlockStart?.start?.toolUse;
            const delta = value.contentBlockDelta?.delta;
            const stopReason = value.messageStop?.stopReason;
            if (startToolUse) {
              toolUse = { ...startToolUse, input: "" };
              assistantMessage = { role: "assistant", content: [{ toolUse }] };
              setActiveMessage(() => structuredClone(assistantMessage));
            } else if (delta) {
              if (delta.text) {
                if (!assistantMessage.content[0]?.text) {
                  assistantMessage.content[0] = { text: "" };
                }
                assistantMessage.content[0].text += delta.text;
              } else if (delta.toolUse) {
                assistantMessage.content[0].toolUse.input += delta.toolUse.input || "";
              }
              setActiveMessage(() => structuredClone(assistantMessage));
            } else if (value.contentBlockStop) {
              setMessages((messages) => messages.concat([assistantMessage]));
              setActiveMessage(null);
            } else if (stopReason === "tool_use") {
              const { toolUse } = assistantMessage.content.find((c) => c.toolUse);
              if (typeof toolUse.input === "string") toolUse.input = JSON.parse(toolUse.input);
              const toolResult = await runTool(toolUse);
              const toolResultMessage = { role: "user", content: [{ toolResult }] };
              setMessages((messages) => messages.concat([toolResultMessage]));
            } else if (stopReason === "end_turn") {
              isComplete = true;
            } else if (value.metadata) {
              console.info(value.metadata);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("An error occurred while sending the message. Please try again later.");
    }
  }

  return html`
    <div class="flex-grow-1">
      ${() =>
        messages().length
          ? [messages().map((message) => html`<${Message} message=${message} />`), html`<${Message} message=${activeMessage()} />`]
          : html`<div class="text-center my-5">
              <h1 class="display-6">Welcome to CompliAI</h1>
              <p class="fw-light fs-5">To get started, send a message below.</p>
            </div>`}
    </div>

    <form onSubmit=${handleSubmit} class="card">
      <textarea
        class="form-control form-control-sm border-0 bg-transparent shadow-0"
        onKeyDown=${handleKeyDown}
        id="message"
        name="message"
        placeholder="Enter message (Shift + Enter for new line)"
        rows="3"
        autofocus
        required />

      <div class="d-flex justify-content-between">
        <input
          type="file"
          id="inputFiles"
          name="inputFiles"
          class="form-control form-control-sm w-auto bg-transparent border-transparent"
          multiple
          disabled />

        <div class="input-group w-auto align-items-center">
          <div class="form-check form-switch mb-0 me-1 form-control-sm d-flex align-item-center">
            <input
              class="form-check-input cursor-pointer me-1"
              type="checkbox"
              role="switch"
              id="screenShare"
              name="screenShare"
              disabled />
            <label class="form-check-label text-primary cursor-pointer" for="screenShare">
              <span class="visually-hidden">Enable Screen Share</span>
              <svg xmlns="http://www.w3.org/2000/svg" height="16" fill="currentColor" viewBox="0 0 576 512">
                <path
                  d="M512 96L64 96l0 103.1C43.4 194.5 22 192 0 192L0 96 0 32l64 0 448 0 64 0 0 64 0 320 0 64-64 0-224 0c0-22-2.5-43.4-7.1-64L512 416l0-320zM0 272l0-48c141.4 0 256 114.6 256 256l-48 0c0-114.9-93.1-208-208-208zM32 416a32 32 0 1 1 0 64 32 32 0 1 1 0-64zm80 64c0-61.9-50.1-112-112-112l0-48c88.4 0 160 71.6 160 160l-48 0z" />
              </svg>
            </label>
          </div>

          <div class="form-check form-switch mb-0 form-control-sm d-flex align-item-center">
            <input
              class="form-check-input cursor-pointer me-1"
              type="checkbox"
              role="switch"
              id="researchMode"
              name="researchMode"
              checked />
            <label class="form-check-label text-secondary cursor-pointer" for="researchMode">
              <span class="visually-hidden">Enable Research Mode</span>
              <svg xmlns="http://www.w3.org/2000/svg" height="16" fill="currentColor" viewBox="0 0 640 512">
                <path
                  d="M176 48l0 148.8c0 20.7-5.8 41-16.6 58.7L100 352l225.8 0c.1 .1 .2 .1 .2 .2c-16.6 10.6-26.7 31.6-20 53.3c4 12.9 9.4 25.5 16.4 37.6s15.2 23.1 24.4 33c15.7 16.9 39.6 18.4 57.2 8.7l0 .9c0 6.7 1.5 13.5 4.2 19.7c-9 4.3-19 6.6-29.7 6.6L69.4 512C31.1 512 0 480.9 0 442.6c0-12.8 3.6-25.4 10.3-36.4L118.5 230.4c6.2-10.1 9.5-21.7 9.5-33.5L128 48l-8 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l40 0L288 0l40 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-8 0 0 148.8c0 11.8 3.3 23.5 9.5 33.5L336 241c-4.9 6.4-9.5 13.1-13.6 20.3c-5.2 9.1-9.6 18.4-13.1 27.9l-20.7-33.6c-10.9-17.7-16.6-38-16.6-58.7L272 48l-96 0zM447.3 203.4c-6.8 1.5-11.3 7.8-11.3 14.8l0 17.4c0 7.9-4.9 15-11.7 18.9c-6.8 3.9-15.2 4.5-22 .6l-13.6-7.8c-6.1-3.5-13.7-2.7-18.5 2.4c-7.5 8.1-14.3 17.2-20.1 27.2s-10.3 20.4-13.5 31c-2.1 6.7 1.1 13.7 7.2 17.2l14 8.1c6.5 3.8 10.1 11 10.1 18.6s-3.5 14.8-10.1 18.6l-14 8.1c-6.1 3.5-9.2 10.5-7.2 17.2c3.3 10.6 7.8 21 13.5 31s12.5 19.1 20.1 27.2c4.8 5.1 12.5 5.9 18.5 2.4l13.5-7.8c6.8-3.9 15.2-3.3 22 .6c6.9 3.9 11.7 11 11.7 18.9l0 17.4c0 7 4.5 13.3 11.3 14.8c10.5 2.4 21.5 3.7 32.7 3.7s22.2-1.3 32.7-3.7c6.8-1.5 11.3-7.8 11.3-14.8l0-17.7c0-7.8 4.8-14.8 11.6-18.7c6.7-3.9 15.1-4.5 21.8-.6l13.8 7.9c6.1 3.5 13.7 2.7 18.5-2.4c7.6-8.1 14.3-17.2 20.1-27.2s10.3-20.4 13.5-31c2.1-6.7-1.1-13.7-7.2-17.2l-14.4-8.3c-6.5-3.7-10-10.9-10-18.4s3.5-14.7 10-18.4l14.4-8.3c6.1-3.5 9.2-10.5 7.2-17.2c-3.3-10.6-7.8-21-13.5-31s-12.5-19.1-20.1-27.2c-4.8-5.1-12.5-5.9-18.5-2.4l-13.8 7.9c-6.7 3.9-15.1 3.3-21.8-.6c-6.8-3.9-11.6-10.9-11.6-18.7l0-17.7c0-7-4.5-13.3-11.3-14.8c-10.5-2.4-21.5-3.7-32.7-3.7s-22.2 1.3-32.7 3.7zM480 303.7a48 48 0 1 1 0 96 48 48 0 1 1 0-96z" />
              </svg>
            </label>
          </div>

          <select class="form-select form-select-sm border-0 bg-transparent cursor-pointer" name="model" id="model" required>
            <optgroup label="Anthropic">
              <option value="anthropic.claude-3-opus-20240229-v1:0" disabled>Claude Opus</option>
              <option value="anthropic.claude-3-5-sonnet-20240620-v1:0" selected>Claude Sonnet</option>
              <option value="anthropic.claude-3-5-haiku-20241022-v1:0">Claude Haiku</option>
            </optgroup>
            <optgroup label="Amazon">
              <option value="amazon.nova-pro-v1:0">Nova Pro</option>
              <option value="amazon.nova-lite-v1:0">Nova Lite</option>
              <option value="amazon.nova-micro-v1:0">Nova Micro</option>
            </optgroup>
          </select>

          <button class="btn btn-secondary btn-sm" type="submit" style="border-radius: 0 0 var(--bs-border-radius-sm) 0">Send</button>
        </div>
      </div>
    </form>
  `;
}
export function Message({ message }) {
  if (!message) return null;
  const isAssistant = message.role === "assistant" || message.toolUse;

  // Filter and join text content
  const textContent = message.content
    .filter((c) => c.text)
    .map((c) => c.text)
    .join("\n");

  // Filter tool use content and results
  const toolCalls = message.content
    .filter((c) => c.toolUse || c.toolResult)
    .map((c) => ({
      ...c.toolUse,
      result: c.toolResult?.content[0]?.json?.results,
    }));

  // Helper to check if input is just code
  const isCodeOnly = (input) => {
    const keys = Object.keys(input);
    return keys.length === 1 && keys[0] === "code";
  };

  // Helper to truncate long strings
  const truncate = (str, maxLength = 2000) => {
    if (!str || str.length <= maxLength) return str;
    return str.slice(0, maxLength) + "\n...";
  };

  // Helper to format tool result
  const formatResult = (result) => {
    if (result === null || result === undefined) return "No result";
    try {
      if (typeof result !== "string") result = JSON.stringify(result, null, 2);
      console.log({ result });
      if (result?.results?.[0]?.url) {
        result = result.results.map((r) => ({title: r.title, url: r.url, snippet: r.snippet}));
      }
      const json = yaml.parse(result);
      return truncate(yaml.stringify(json).split('\n').slice(0, 4).join('\n'));
    } catch (error) {
      console.error(error);
      return truncate(result.toString());
    }
  };

  return html`
    <div class="d-flex flex-wrap">
      ${textContent?.trim().length > 0 &&
      html`
        <span
          class=${["card mb-2 p-2 small", isAssistant ? "bg-light w-100 border-secondary" : "bg-white"].join(" ")}
          innerHTML=${parseMarkdown(textContent)}>
        </span>
      `}
      ${toolCalls.map(
        (tool) => html`
          ${tool.name &&
          tool.input &&
          html`
            <div class="card w-100 mb-2 border-secondary">
              <div class="card-header bg-secondary bg-opacity-10 py-1 px-2">
                <small class="text-secondary">Tool Call: ${tool.name}</small>
              </div>
              <div class="card-body p-2">
                ${isCodeOnly(tool.input)
                  ? html`<pre class="mb-0"><code>${tool.input.code}</code></pre>`
                  : html`<pre class="mb-0"><code>${JSON.stringify(tool.input, null, 2)}</code></pre>`}
              </div>
            </div>
          `}
          ${tool.result &&
          html`
            <div class="card w-100 mb-2 border-success">
              <div class="card-header bg-success bg-opacity-10 py-1 px-2">
                <small class="text-success">Tool Result</small>
              </div>
              <div class="card-body p-2">
                <pre class="mb-0"><code>${formatResult(tool.result)}</code></pre>
              </div>
            </div>
          `}
        `
      )}
    </div>
  `;
}
