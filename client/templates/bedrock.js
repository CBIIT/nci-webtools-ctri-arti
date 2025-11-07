// =================================================================================
// 1. IMPORTS & SETUP
// =================================================================================

import { BedrockRuntimeClient, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { openDB, deleteDB } from "idb";
import { render } from "solid-js/web";
import { For, Switch, Match, createEffect } from "solid-js";
import { createStore, produce, unwrap } from "solid-js/store";
import html from "solid-js/html";

// try { await deleteDB("bedrock-messages"); } catch (e) { console.warn(e);}
const db = await openDB("bedrock-messages", 1, {
  upgrade(db) {
    const tables = {};
    const tableNames = ["agents", "threads", "messages", "resources"];
    for (const tableName of tableNames) {
      if (!db.objectStoreNames.contains(tableName)) {
        const store = db.createObjectStore(tableName, { keyPath: "id", autoIncrement: true });
        store.createIndex("id", "id", { unique: true });
        tables[tableName] = store;
      }
    }

    tables.messages.createIndex("agentId", "agentId");
    tables.messages.createIndex("threadId", "threadId");
    tables.threads.createIndex("agentId", "agentId");

    tables.resources.createIndex("agentId", "agentId");
    tables.resources.createIndex("threadId", "threadId");
    tables.resources.createIndex("messageId", "messageId");
  },
});

if (!await db.count("agents")) {
  let r = await db.add("agents", {
    name: "default",
    systemPrompt: "You are honest. When you are uncertain about something, or if your tools aren't working right, you let the user know. You write in brief, artistic prose, without any *markdown*, lists, bullet points, emojis or em-dashes (—).",
    tools: ["code", "think"],
    resources: [],
  });
}

const TOOLS = [
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
    fn: think,
    toolSpec: {
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
];

render(App, document.getElementById("app"));

// =================================================================================
// 2. UI COMPONENTS
// =================================================================================

function MessageContent(props) {
  function findToolResult(messages, toolUseId) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const { content } = messages[i];
      for (const c of content) {
        if (c.toolResult?.toolUseId === toolUseId) {
          return c.toolResult;
        }
      }
    }
  }
  if (props.content.text !== undefined) {
    if (props.role === "user") {
      return html`<div class="small rounded p-2 mb-3 text-dark bg-secondary-subtle d-inline-block text-pre">
        ${() => props.content.text}
      </div>`;
    } else if (props.role === "assistant") {
      return html`<div class="small p-2 mb-3 text-pre ">${() => props.content.text}</div>`;
    }
  }
  else if (props.content.reasoningContent || props.content.toolUse?.name === "think") {
    return html`<details class="small rounded border p-2 mb-3">
      <summary class="cursor-pointer text-dark">View Reasoning</summary>
      <p class="my-2 text-muted">${() => props.content.reasoningContent?.reasoningText?.text || parseJSON(props.content.toolUse?.input)?.thought}</p>
    </details>`;
  }
  else if (props.content.toolUse) {
    return html`<details class="small rounded border p-2 mb-3">
      <summary class="cursor-pointer text-dark">${() => props.content.toolUse.name}</summary>
      <div class="my-2 text-muted text-pre">
        ${() => JSON.stringify(parseJSON(props.content.toolUse.input || "{}"), null, 2)}
        <hr />
        ${() => JSON.stringify(findToolResult(props.messages, props.content.toolUse.toolUseId) || {}, null, 2)}
      </div>
    </details>`;
  }
}

function setSearchParams(obj) {
  const searchParams = new URLSearchParams(window.location.search);
  for (let key in obj) {
    const value = obj[key]
    if (![null, undefined].includes(value))
      searchParams.set(key, obj[key]);
  }
  const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
  window.history.replaceState({}, "", newUrl);
}

function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const urlParams = Object.fromEntries(searchParams.entries());
  const { agent, sendMessage, params } = useAgent(urlParams, db);
  createEffect(() => setSearchParams(params));

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
          ${(content) => html`<${MessageContent} role=${message.role} content=${content} messages=${() => agent.messages} />`}
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

function useAgent({ agentId, threadId }, db) {
  agentId = +agentId || 1;
  threadId = +threadId || null;

  const [params, setParams] = createStore({ agentId, threadId });
  const [agent, setAgent] = createStore({
    id: null,
    name: null,
    thread: {
      id: null,
      name: null,
    },
    modelId: null,
    reasoningMode: false,
    systemPrompt: null,
    loading: false,
    tools: TOOLS,
    // threadName: null,
    // threadId: null,
    messages: [],
  });

  // load history
  createEffect(async () => {
    if (!params.threadId) return;
    const history = await db.getAllFromIndex("messages", "threadId", params.threadId);
    if (!history?.length) return;
    const thread = await db.get("threads", params.threadId);
    setAgent("messages", history.map((m) => ({ role: m.role, content: m.content })));
    setAgent("thread", "name", thread?.name || "Untitled");
  });

  // save changes when store updates
  createEffect(async () => {
    // only save changes if we've loaded an agent
    if (!params.agentId || !agent.id) return;
    await upsert(db, "agents", {
      id: params.agentId,
      name: agent.name,
      systemPrompt: agent.systemPrompt,
      tools: agent.tools.map((t) => t.toolSpec.name),
    });
    // only save thread if we've loaded one
    if (!params.threadId || !agent.thread.id) return;
    await upsert(db, "threads", {
      id: params.threadId,
      agentId: params.agentId,
      name: agent.thread.name,
    });
  })

  async function upsert(db, table, obj, key = "id") {
    const existing = await db.get(table, obj[key]);
    if (existing) {
      const updated = { ...existing, ...obj };
      await db.put(table, updated);
      return updated;
    } else {
      const id = await db.add(table, obj);
      return { ...obj, [key]: id };
    }
  }

  async function sendMessage(text, files = [], modelId, reasoningMode) {
    setAgent("loading", true);
    if (!params.threadId) {
      setAgent("thread", "name", "Untitled");
      const thread = { agentId, name: agent.thread.name };
      const threadId = await db.add("threads", thread);
      setParams("threadId", threadId);
    }

    const record = await db.get("agents", +params.agentId);
    const agentTools = TOOLS.filter((t) => record.tools.includes(t.toolSpec.name));
    console.log(record);

    const client = await getConverseClient();
    const content = await getMessageContent(text, files);
    const userMessage = { role: "user", content };
    setAgent("id", record.id);
    setAgent("thread", "id", params.threadId);
    setAgent("modelId", modelId);
    setAgent("reasoningMode", reasoningMode);
    setAgent("name", record.name);
    setAgent("systemPrompt", record.systemPrompt);
    setAgent("resources", record.resources);
    setAgent("tools", agentTools);
    setAgent("messages", agent.messages.length, userMessage);
    const messages = await runAgent(agent, setAgent, client);
    for (const message of messages) {
      const record = unwrap(message);
      record.agentId = params.agentId;
      record.threadId = params.threadId;
      await db.add("messages", record);
    }
    setAgent("loading", false);
  }

  return { agent, params, setAgent, sendMessage };
}

// =================================================================================
// 5. TOOL HANDLING
// =================================================================================

async function getConverseClient() {
  const config = await getAwsConfig(localStorage, "aws-config")
  const client = new BedrockRuntimeClient(config);
  const send = (input) => client.send(getConverseCommand(input));
  return { client, send };
}

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

/**
 * Runs the agent loop, processing messages until completion.
 * @param {any} store - Agent store with messages and tools
 * @param {any} setStore - Function to update the store
 * @param {any} client - Converse client with send() method 
 * @returns {Promise<Array>} New messages generated by the agent
 */
async function runAgent(store, setStore, client) {
  const tools = {};
  for (const tool of store.tools) {
    tools[tool.toolSpec.name] = tool.fn;
  }

  let startingIndex = store.messages.length - 1;
  let isComplete = false;
  while (!isComplete) {
    const output = await client.send(store);
    const assistantMessage = { role: "assistant", content: [] };
    setStore("messages", store.messages.length, assistantMessage);
    for await (const message of output.stream) {
      setStore(produce(async (s) => {
        isComplete ||= await processMessage(s, message, tools);
      }));
    }
  }
  return store.messages.slice(startingIndex);
}

/**
 * Stores the message updates and determines if processing is complete.
 * @param {*} s current store state
 * @param {*} message message update from the model
 * @returns {Promise<boolean>} true if the message is complete and no further processing is needed
 */
async function processMessage(s, message, tools) {
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
      s.messages.push(await runTools(toolUses, tools));
    } else {
      return true;
    }
  }
  return false;
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


/**
 * Executes the tools requested by the model and returns a single "user" role message
 * containing all the results.
 */
async function runTools(toolUses, tools) {
  const toolResults = await Promise.all(toolUses.map((t) => runTool(t, tools)));
  const content = toolResults.map((toolResult) => ({ toolResult }));
  return { role: "user", content };
}

async function runTool(toolUse, tools) {
  let { toolUseId, name, input } = toolUse;
  try {
    const result = await tools?.[name]?.(input);
    const content = [{ json: { result } }];
    return { toolUseId, content };
  } catch (error) {
    console.error("Tool error:", error);
    const result = error.stack || error.message || String(error);
    const content = [{ json: { result } }];
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
