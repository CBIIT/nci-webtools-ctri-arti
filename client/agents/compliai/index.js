import { parse as parseMarkdown } from "marked";
import { onCleanup, createSignal } from "solid-js";
import { render } from "solid-js/web";
import html from "solid-js/html";
import yaml from "yaml";
import { getWebsiteText, runJavascript, search, readStream } from "./utils.js";

// Initialize the app
render(() => html`<${Page} />`, window.app);

// Constants
const API_ENDPOINT = "/api/model/stream";
const DEFAULT_SYSTEM_MESSAGE = `
You are a systematic problem solver who adjusts your analysis depth based on problem complexity. For simpler tasks, provide concise solutions. For complex problems, especially those involving code or logic, examine each component thoroughly.

When solving problems:
1. Start by explicitly stating all constraints and goals, quoting relevant parts of the problem description
2. Break complex problems into smaller components
3. For each component:
   - Begin with "Let's examine..."
   - Document your analysis path, including failed attempts
   - Note key insights with "Wait" 
   - Challenge assumptions with "But what if..."
   - Test ideas with concrete examples
   - If stuck, try new approaches with "Let's think differently..."
   - Question and verify conclusions

For debugging or complex analysis:
- Walk through each element sequentially
- Document your understanding of each piece
- Identify potential issues or edge cases
- Test hypotheses with examples
- Consider interactions between components
- Verify solutions against original requirements

Show your full reasoning process, including:
- Uncertainties and revisions
- Failed attempts and why they failed
- Connections between components
- Verification of solutions

Share your thought process in <think> tags, your draft response in <draft> tags, and your final response in <response> tags. Ensure you use at least 3 drafts. Follow each draft with the "Wait" keyword to begin your thought process. Use natural language while maintaining technical precision. When you discover errors in your reasoning, acknowledge them openly and explain your corrections.
`;

const SEARCH_SYSTEM_MESSAGE = `You are a research assistant that builds comprehensive answers through systematic investigation.

Start with the core question: "What do we need to know to fully answer this?"

Break complex topics into distinct concepts:
- Fundamental facts and definitions
- Current data and statistics
- Expert analysis and insights
- Practical implications
- Challenges and concerns

For each concept:
"What specific information will advance our understanding?"
- Form focused search queries
- Extract detailed content from reliable sources
- Calculate and analyze where needed
- Connect new insights to previous findings

Using the tools effectively:
search for distinct concepts:
Good: "AI medical diagnosis accuracy rates 2024"
Bad: "AI healthcare general information"

getWebsiteText for depth:
- Authoritative sources only
- Main content focus
- Skip problematic pages

runJavascript for rigor:
- Verify numerical claims
- Analyze patterns
- Process datasets
- Support conclusions

Building understanding:
- Start with core concepts
- Add complexity naturally
- Support claims with data
- Note certainty levels
- Cite sources precisely

Always build toward answering the core question.`;

const TOOLS = [
  {
    toolSpec: {
      name: "search",
      description:
        "Search the web for relevant, factual information to answer queries. Use this to find recent or specific information that you need to verify. Each search returns up to 25 results.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            keywords: {
              type: "string",
              description:
                'Search query. Use quotes for exact phrases ("exact phrase") and boolean operators (AND, OR, NOT) for complex queries. Be specific and include relevant dates, names, or identifiers.',
            },
            offset: {
              type: "number",
              description: "Number of results to skip. Use with vqd for pagination when initial results are insufficient.",
            },
            time: {
              type: "string",
              description: "Optional date range in YYYY-MM-DD..YYYY-MM-DD format. Use when temporal context is important.",
            },
            vqd: {
              type: "string",
              description: "Search continuation token. Include this value from previous search when paginating results.",
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
      description:
        "Execute JavaScript code to analyze data, verify numerical claims, or detect patterns. Use this for mathematical calculations, data processing, or when you need to verify specific numerical assertions.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description:
                "JavaScript code to execute. Structure your code to output clear, verifiable results using console.log(). Include error handling for robust analysis. If asked to implement requirements, write tests to verify correctness. Execute code and tests together.",
            },
          },
          required: ["code"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "getWebsiteText",
      description:
        "Extract detailed content from webpages to verify claims or gather comprehensive information. Use this when you need to fact-check or analyze specific web content.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description:
                "Full webpage URL (including http:// or https://). Ensure the URL is directly relevant to the information needed.",
            },
            expandUrls: {
              type: "boolean",
              description:
                "Set to true to show all URLs in the text content. Use this when you need to verify sources or cross-reference information.",
              default: false,
            },
          },
          required: ["url"],
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
            system: form.researchMode.checked ? SEARCH_SYSTEM_MESSAGE : DEFAULT_SYSTEM_MESSAGE,
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
            }
            else if (delta) {
              if (delta.text) {
                if (!assistantMessage.content[0]?.text) {
                  assistantMessage.content[0] = { text: "" };
                }
                assistantMessage.content[0].text += delta.text;
              } else if (delta.toolUse) {
                assistantMessage.content[0].toolUse.input += delta.toolUse.input || "";
              }
              setActiveMessage(() => structuredClone(assistantMessage));
            }
            else if (value.contentBlockStop) {
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
      const json = yaml.parse(result);
      return truncate(yaml.stringify(json));
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
