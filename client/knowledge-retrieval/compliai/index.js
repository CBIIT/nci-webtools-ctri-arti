import { parse as parseMarkdown } from "marked";
import { onCleanup, createSignal } from "solid-js";
import { render } from "solid-js/web";
import html from "solid-js/html";
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
      description: "Search the web for relevant, factual information to answer queries. Use this to find recent or specific information that you need to verify. Each search returns up to 25 results.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            keywords: {
              type: "string",
              description: "Search query. Use quotes for exact phrases (\"exact phrase\") and boolean operators (AND, OR, NOT) for complex queries. Be specific and include relevant dates, names, or identifiers.",
            },
            offset: {
              type: "number",
              description: "Number of results to skip. Use with vqd for pagination when initial results are insufficient."
            },
            time: {
              type: "string",
              description: "Optional date range in YYYY-MM-DD..YYYY-MM-DD format. Use when temporal context is important."
            },
            vqd: {
              type: "string",
              description: "Search continuation token. Include this value from previous search when paginating results."
            }
          },
          required: ["keywords"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "runJavascript",
      description: "Execute JavaScript code to analyze data, verify numerical claims, or detect patterns. Use this for mathematical calculations, data processing, or when you need to verify specific numerical assertions.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "JavaScript code to execute. Structure your code to output clear, verifiable results using console.log(). Include error handling for robust analysis.",
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
      description: "Extract detailed content from webpages to verify claims or gather comprehensive information. Use this when you need to fact-check or analyze specific web content.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "Full webpage URL (including http:// or https://). Ensure the URL is directly relevant to the information needed.",
            },
            expandUrls: {
              type: "boolean",
              description: "Set to true to convert relative URLs in the content to absolute URLs. Use when analyzing link relationships.",
              default: false,
            },
          },
          required: ["url"],
        },
      },
    },
  },
]

async function runTool(toolUse, tools = { search, getWebsiteText, runJavascript }) {
  const { toolUseId, name, input } = toolUse;
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
    const userMessage = {
      role: "user",
      content: [{ text: message }],
    };
    const newMessages = [...messages(), userMessage];
    form.message.value = "";
    form.inputFiles.value = "";
    setMessages(newMessages);

    try {
      let currentMessages = [...newMessages];
      let isComplete = false;

      while (!isComplete) {
        const response = await fetch(API_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: form.model.value,
            system: form.researchMode.checked ? SEARCH_SYSTEM_MESSAGE : DEFAULT_SYSTEM_MESSAGE,
            tools: TOOLS,
            messages: currentMessages,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const decoder = new TextDecoder();
        const assistantMessage = {
          role: "assistant",
          content: [{ text: "" }],
        };

        // Process the streaming response
        let currentToolUse = null;
        let toolInput = "";

        for await (const chunk of readStream(response)) {
          const values = decoder
            .decode(chunk, { stream: true })
            .trim()
            .split("\n")
            .map((e) => JSON.parse(e));

          for (const value of values) {
            // Handle message start
            if (value.messageStart) {
              assistantMessage.role = value.messageStart.role;
            }
            // Handle content block delta
            else if (value.contentBlockDelta) {
              const { contentBlockIndex, delta } = value.contentBlockDelta;

              // Handle text content
              if (delta.text) {
                if (!assistantMessage.content[contentBlockIndex]) {
                  assistantMessage.content[contentBlockIndex] = { text: "" };
                }
                assistantMessage.content[contentBlockIndex].text += delta.text;
                console.log(assistantMessage.content[contentBlockIndex].text);
                setActiveMessage(() => structuredClone(assistantMessage));
              }
              // Handle tool use
              else if (delta.toolUse) {
                if (currentToolUse) {
                  toolInput += delta.toolUse.input || "";
                }
                const toolUse = [{ name: currentToolUse?.name, input: toolInput }]
                setActiveMessage(() =>  ({ content: [{ toolUse }] }));
              }
            }
            // Handle content block start for tool use
            else if (value.contentBlockStart?.start?.toolUse) {
              currentToolUse = {
                toolUseId: value.contentBlockStart.start.toolUse.toolUseId,
                name: value.contentBlockStart.start.toolUse.name,
                input: "",
              };
            }
            // Handle content block stop
            else if (value.contentBlockStop && currentToolUse) {
              try {
                currentToolUse.input = JSON.parse(toolInput);
                assistantMessage.content.push({ toolUse: currentToolUse });
                toolInput = "";
                currentToolUse = null;
                setMessages([...currentMessages, assistantMessage]);
              } catch (e) {
                console.error("Error parsing tool input:", e);
              }
            }
            // Handle message stop
            else if (value.messageStop) {
              if (value.messageStop.stopReason === "tool_use") {
                const toolUse = assistantMessage.content.find((c) => c.toolUse)?.toolUse;
                setActiveMessage(() => ({content: [{toolUse}] }));
                if (toolUse) {
                  const toolResult = await runTool(toolUse);
                  currentMessages = [...currentMessages, assistantMessage, { role: "user", content: [{ toolResult }] }];
                  setMessages(currentMessages);
                }
              } else if (value.messageStop.stopReason === "end_turn") {
                isComplete = true;
                currentMessages = [...currentMessages, assistantMessage];
                setMessages(currentMessages);
                setActiveMessage(null);
              }
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
          <div class="form-check form-switch mb-0 form-control-sm">
            <input class="form-check-input cursor-pointer" type="checkbox" role="switch" id="researchMode" name="researchMode" checked />
            <label class="form-check-label cursor-pointer" for="researchMode">
              <span class="visually-hidden">Search</span>
              <i class="bi bi-search"></i>
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
  console.log(message);

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
    if (typeof result === "string") return truncate(result);
    return truncate(JSON.stringify(result, null, 2));
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

/**
 * Uses search + an llm model to research a topic
 * @param {string} topic - The topic to research

export async function research({ topic }) {
  const prompt = `Research the following topic: ${topic}

Expected deliverables:
1. Executive summary (2-3 sentences)
2. Key findings (organized by theme)
3. Supporting evidence and data
4. Analysis and implications
5. References with brief source credibility notes`;

  const messages = [{ role: "user", content: [{ text: prompt }] }];
  ;
  const toolConfig = {
    tools
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
 */
