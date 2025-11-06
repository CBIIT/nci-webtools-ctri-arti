// =================================================================================
// 1. IMPORTS & SETUP
// =================================================================================

import { BedrockRuntimeClient, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { render } from "solid-js/web";
import { For, Switch, Match } from "solid-js";
import { createStore, produce } from "solid-js/store";
import html from "solid-js/html";

const AGENT_CONFIG = {
  modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  reasoningMode: false,
  systemPrompt: "You are a helpful assistant.",
  loading: false,
  tools: [
    {
      fn: code,
      toolSpec: {
        name: "code",
        description: "Execute JavaScript or HTML code snippets.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              code: { type: "string", description: "The JavaScript code to execute. Eg: 2+2" },
              language: {
                type: "string",
                description: "The programming language of the code (e.g., 'javascript', 'html').",
                default: "javascript",
              },
            },
            required: ["code"],
          },
        },
      },
    },
    {
      toolSpec: {
        fn: think,
        name: "think",
        description:
          "Use this tool to create a dedicated thinking space for complex reasoning. Use it when you need to analyze information, plan steps, or work through problems before providing a final answer.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              thought: {
                type: "string",
                description: "Your detailed thought process, analysis, or reasoning steps.",
              },
            },
            required: ["thought"],
          },
        },
      },
    },
  ],
  messages: [],
};


render(App, document.getElementById("app"));

// =================================================================================
// 2. UI COMPONENTS
// =================================================================================

function MessageContent(props) {
  if (props.content.text !== undefined) {
    if (props.role === "user") {
      return html`<div class="border rounded p-2 mb-3 text-dark fw-mediume bg-secondary-subtle shadow-sm d-inline-block text-pre">${() => props.content.text}</div>`;
    } else if (props.role === "assistant") {
      return html`<div class="p-2 mb-3 text-pre">${() => props.content.text}</div>`;
    }
  }

  if (props.content.toolUse) {
    return html`<div class="card mt-2 shadow-sm">
      <div class="card-header bg-light small">
        <strong>Tool Call:</strong> <code>${() => props.content.toolUse.name}</code>
      </div>
      <div class="card-body">
        <pre class="bg-dark text-white p-2 rounded small">
          ${() => JSON.stringify(parseJSON(props.content.toolUse.input || "{}"), null, 2)}
        </pre>
      </div>
    </div>`;
  }
  if (props.content.toolResult) {
    const result = props.content.toolResult.content[0].json?.results;
    return html` <div class="card mt-2 bg-light shadow-sm">
      <div class="card-header small"><strong>Tool Result</strong></div>
      <div class="card-body">
        <pre>${() => JSON.stringify(result, null, 2)}</pre>
      </div>
    </div>`;
  }
  if (props.content.reasoningContent) {
    return html` <details class="mt-2">
      <summary class="cursor-pointer text-muted small"><em>View Reasoning</em></summary>
      <p class="p-2 border rounded bg-light small fst-italic" style="white-space: pre-wrap;">
        ${() => props.content.reasoningContent.reasoningText?.text}
      </p>
    </details>`;
  }
  return html`<pre>${() => JSON.stringify(props.content, null, 2)}</pre> `;
}

function App() {
  const { agent, sendMessage } = useAgent(AGENT_CONFIG);

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !agent.loading) {
      event.preventDefault();
      event.target?.closest("form")?.requestSubmit();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const text = form.userMessage.value;
    const files = Array.from(form.userFiles.files || []);
    const modelId = form.modelId.value;
    const reasoningMode = form.reasoningMode.checked;

    form.userMessage.value = "";
    form.userFiles.value = "";

    await sendMessage(text, files, modelId, reasoningMode);
  }

  return html`
    <div class="container my-5">
      <${For} each=${() => agent.messages}>
        ${(message) => html`<${For} each=${() => message.content}>
          ${(content) => html`<${MessageContent} role=${message.role} content=${content} />`}
        <//>`}
      <//>

      <form id="inputForm" onSubmit=${handleSubmit} class="shadow-sm bg-white border rounded">
        <textarea
          id="userMessage"
          class="form-control form-control-sm rounded p-2 border-0 shadow-none"
          rows="3"
          placeholder="Enter message"
          aria-label="User message"
          onKeyDown=${handleKeyDown}
          required></textarea>
        <div class="d-flex align-items-center justify-content-between gap-1 p-2">
          <div class="d-flex flex-grow-1 gap-2 align-items-center">
            <input
              type="file"
              name="userFiles"
              id="userFiles"
              class="visually-hidden"
              accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.tsv,,.md,.json,text/*"
              multiple />
            
            <label for="userFiles" class="btn btn-sm btn-secondary">
              <span class="visually-hidden">Attach Files</span>
              <i class="bi bi-paperclip"></i> 
            </label>

            <div class="form-check form-switch form-control-sm">
              <input
                class="form-check-input"
                type="checkbox"
                role="switch"
                id="reasoningMode"
                name="reasoningMode"
                title="Enable extended reasoning mode" />
              <label class="form-check-label" for="reasoningMode">
                <span class="visually-hidden">Reasoning Mode</span>
                <i class="bi bi-lightbulb-fill text-secondary"></i>
              </label>
            </div>
          </div>

          <div class="d-flex align-items-center gap-2">
            <select
              id="modelId"
              class="form-select form-select-sm w-auto border-transparent shadow-none"
              required>
              <option value="us.anthropic.claude-opus-4-1-20250805-v1:0">Opus 4.1</option>
              <option value="us.anthropic.claude-sonnet-4-5-20250929-v1:0">Sonnet 4.5</option>
              <option value="us.anthropic.claude-haiku-4-5-20251001-v1:0" selected>Haiku 4.5</option>
            </select>
            <button type="submit" class="btn btn-sm btn-dark">Send</button>
          </div>
        </div>
      </form>
    </div>
  `;
}

// =================================================================================
// 4. CORE LOGIC & STATE
// =================================================================================

function useAgent(config = AGENT_CONFIG) {
  const [agent, setAgent] = createStore(config);

  async function sendMessage(text, files = [], modelId, reasoningMode) {
    setAgent("loading", true);
    const content = await getMessageContent(text, files);
    const userMessage = { role: "user", content };
    setAgent("modelId", modelId);
    setAgent("reasoningMode", reasoningMode);
    setAgent("messages", agent.messages.length, userMessage);
    await runAgent(agent, setAgent);
    setAgent("loading", false);
  }

  return { agent, setAgent, sendMessage };
}

// =================================================================================
// 5. TOOL HANDLING
// =================================================================================

async function getAwsConfig(storage = localStorage, key = "aws-config") {
  try {
    const config = await storage.getItem(key);
    if (!config) throw new Error("No config found");
    return JSON.parse(config);
  } catch (error) {
    const region = prompt("AWS region [us-east-1]:");
    const accessKeyId = prompt("AWS Access Key ID:");
    const secretAccessKey = prompt("AWS Secret Access Key:");
    const sessionToken = prompt("AWS Session Token [optional]:");
    const config = {
      region: region || "us-east-1",
      credentials: { accessKeyId, secretAccessKey, sessionToken: sessionToken || undefined },
    };
    await storage.setItem(key, JSON.stringify(config));
    return config;
  }
}

function getConverseCommand(config) {
  const cachePoint = { type: "default" };
  const additionalModelRequestFields = {};
  if (config.reasoningMode) {
    additionalModelRequestFields.thinking = { type: "enabled", budget_tokens: +32_000 };
  }
  const tools = config.tools
    .map(({ toolSpec }) => ({ toolSpec }))
    .filter(Boolean);

  return new ConverseStreamCommand({
    modelId: config.modelId,
    messages: config.messages,
    system: [{ text: config.systemPrompt, cachePoint }],
    toolConfig: { tools: [...tools, { cachePoint }] },
    additionalModelRequestFields,
  });
}

async function runAgent(store, setStore, client = null) {
  client ||= new BedrockRuntimeClient(await getAwsConfig(localStorage, "aws-config"));
  const tools = {};
  for (const tool of store.tools) {
    tools[tool.toolSpec.name] = tool.fn;
  }

  let isComplete = false;
  while (!isComplete) {
    const output = await client.send(getConverseCommand(store));
    const assistantMessage = { role: "assistant", content: [] };
    setStore("messages", store.messages.length, assistantMessage);

    for await (const message of output.stream) {
      await sleep(50);

      // using immer to simplify nested state updates
      setStore(
        produce(async (s) => {
          const { contentBlockStart, contentBlockDelta, contentBlockStop, messageStop } = message;
          const toolUse = contentBlockStart?.start?.toolUse;
          const stopReason = messageStop?.stopReason;
          const messageContent = s.messages.at(-1).content;

          if (toolUse) {
            const { contentBlockIndex } = contentBlockStart;
            messageContent[contentBlockIndex] = { toolUse };
          } else if (contentBlockDelta) {
            const { contentBlockIndex, delta } = contentBlockDelta;
            const { reasoningContent, text, toolUse } = delta;
            messageContent[contentBlockIndex] ||= {};
            const block = messageContent[contentBlockIndex];

            if (reasoningContent) {
              block.reasoningContent ||= { reasoningText: {} };
              const reasoning = block.reasoningContent;
              const { text, signature, redactedContent } = reasoningContent;
              if (text) {
                reasoning.reasoningText.text ||= "";
                reasoning.reasoningText.text += text;
              } else if (signature) {
                reasoning.reasoningText.signature ||= "";
                reasoning.reasoningText.signature += signature;
              } else if (redactedContent) {
                reasoning.redactedContent ||= "";
                reasoning.redactedContent += redactedContent;
              }
            } else if (text) {
              block.text ||= "";
              block.text += text;
            } else if (toolUse) {
              block.toolUse.input ||= "";
              block.toolUse.input += toolUse.input;
            }
          } else if (contentBlockStop) {
            const { contentBlockIndex } = contentBlockStop;
            const block = messageContent[contentBlockIndex];
            if (block.toolUse) {
              block.toolUse.input = parseJSON(block.toolUse.input);
            }
          } else if (stopReason) {
            if (stopReason === "tool_use") {
              const toolUses = messageContent.map((c) => c.toolUse).filter(Boolean);
              const toolResults = await Promise.all(toolUses.map((t) => runTool(t, tools)));
              const content = toolResults.map((toolResult) => ({ toolResult }));
              const toolResultsMessage = { role: "user", content };
              s.messages.push(toolResultsMessage);
            } else {
              isComplete = true;
            }
          }
        })
      );
    }
  }
}

async function getMessageContent(text, files) {
  const content = [{ text }];
  if (files.length > 0) {
    for (const file of files) {
      const fileContent = await getContentBlock(file);
      if (fileContent) {
        content.push(fileContent);
      }
    }
  }
  return content;
}

async function getContentBlock(file) {
  console.log(file);
  const documentTypes = ["pdf", "csv", "doc", "docx", "xls", "xlsx", "html", "txt", "md"];
  const imageTypes = ["png", "jpg", "jpeg", "gif", "webp"];
  const isText = file.type.startsWith("text/") || file.type.includes("json") || file.type.includes("xml");
  const fileExtension = file.name.split(".").pop().toLowerCase();

  let format = fileExtension;
  if (isText && !documentTypes.includes(fileExtension)) format = "txt";
  if (fileExtension === "htm") format = "html";
  if (fileExtension === "jpeg") format = "jpg";

  const type = imageTypes.includes(format) ? "image" :
    documentTypes.includes(format) ? "document" : null;
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const name = file.name
    .replace(/[^A-Z0-9 _\-\(\)\[\]]/gi, "_")
    .replace(/\s+/g, " ").trim();

  if (type) {
    return {
      [type]: { format, name, source: { bytes } }
    }
  }
}

async function runTool(toolUse, tools = { code, think }) {
  let { toolUseId, name, input } = toolUse;
  try {
    const results = await tools?.[name]?.(input);
    const content = [{ json: { results } }];
    return { toolUseId, content };
  } catch (error) {
    console.error("Tool error:", error);
    const errorText = error.stack || error.message || String(error);
    const content = [{ text: `Error running ${name}: ${errorText} ` }];
    return { toolUseId, content };
  }
}

async function code(input) {
  return await new Function(input.code)();
}

function think(input) {
  return "Thinking complete.";
}

// =================================================================================
// 6. UTILITIES
// =================================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parses a JSON string incrementally, returning partial results for incomplete inputs.
 * @param {string} input - JSON string to parse.
 * @returns {any} Parsed JSON object, array, or value.
 */
function parseJSON(input) {
  if (typeof input !== "string") {
    return input;
  }
  const jsonString = input.trim();
  if (jsonString === "") {
    return null;
  }
  let index = 0;
  const LITERALS = {
    true: true,
    false: false,
    null: null,
    NaN: NaN,
    Infinity: Infinity,
    "-Infinity": -Infinity,
  };
  function skipWhitespace() {
    while (index < jsonString.length && " \n\r\t".includes(jsonString[index])) {
      index++;
    }
  }
  function parseValue() {
    skipWhitespace();
    if (index >= jsonString.length) {
      throw new Error("Unexpected end of input");
    }
    const char = jsonString[index];
    if (char === "{") return parseObject();
    if (char === "[") return parseArray();
    if (char === '"') return parseString();
    const remainingText = jsonString.substring(index);
    for (const [key, value] of Object.entries(LITERALS)) {
      if (jsonString.startsWith(key, index)) {
        const endPos = index + key.length;
        if (endPos === jsonString.length || ",]} \n\r\t".includes(jsonString[endPos])) {
          index = endPos;
          return value;
        }
      }
      if (key.startsWith(remainingText)) {
        index = jsonString.length;
        return value;
      }
    }
    if (char === "-" || (char >= "0" && char <= "9")) {
      return parseNumber();
    }
    throw new Error(`Unexpected token '${char}' at position ${index} `);
  }
  function parseArray() {
    index++;
    const arr = [];
    while (index < jsonString.length && jsonString[index] !== "]") {
      try {
        arr.push(parseValue());
        skipWhitespace();
        if (jsonString[index] === ",") {
          index++;
        } else if (jsonString[index] !== "]") {
          break;
        }
      } catch (e) {
        return arr;
      }
    }
    if (index < jsonString.length && jsonString[index] === "]") {
      index++;
    }
    return arr;
  }
  function parseObject() {
    index++; // Skip '{'
    const obj = {};
    while (index < jsonString.length && jsonString[index] !== "}") {
      try {
        skipWhitespace();
        if (jsonString[index] !== '"') break;
        const key = parseString();
        skipWhitespace();
        if (index >= jsonString.length || jsonString[index] !== ":") break;
        index++;
        obj[key] = parseValue();
        skipWhitespace();
        if (jsonString[index] === ",") {
          index++;
        } else if (jsonString[index] !== "}") {
          break;
        }
      } catch (e) {
        return obj;
      }
    }
    if (index < jsonString.length && jsonString[index] === "}") {
      index++; // Skip '}'
    }
    return obj;
  }
  function parseString() {
    if (jsonString[index] !== '"') {
      throw new Error("Expected '\"' to start a string");
    }
    const startIndex = index;
    index++; // Skip opening quote
    let escape = false;
    while (index < jsonString.length) {
      if (jsonString[index] === '"' && !escape) {
        const fullString = jsonString.substring(startIndex, ++index);
        return JSON.parse(fullString);
      }
      escape = jsonString[index] === "\\" ? !escape : false;
      index++;
    }
    const partialStr = jsonString.substring(startIndex);
    try {
      return JSON.parse(partialStr + '"');
    } catch (e) {
      const lastBackslash = partialStr.lastIndexOf("\\");
      if (lastBackslash > 0) {
        return JSON.parse(partialStr.substring(0, lastBackslash) + '"');
      }
      return partialStr.substring(1);
    }
  }
  function parseNumber() {
    const startIndex = index;
    const numberChars = "0123456789eE.+-";
    while (index < jsonString.length && numberChars.includes(jsonString[index])) {
      index++;
    }
    const numStr = jsonString.substring(startIndex, index);
    if (!numStr) throw new Error("Empty number literal");
    try {
      return parseFloat(numStr);
    } catch (e) {
      if (numStr.length > 1) {
        return parseFloat(numStr.slice(0, -1));
      }
      throw e;
    }
  }
  const result = parseValue();
  skipWhitespace();
  if (index < jsonString.length) {
    console.warn(`Extra data found at position ${index}: "${jsonString.substring(index)}"`);
  }
  return result;
}
