// =================================================================================
// 1. IMPORTS & SETUP
// =================================================================================

import { BedrockRuntimeClient, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { GoogleGenAI } from "@google/genai";
import { openDB, deleteDB } from "idb";
import { render } from "solid-js/web";
import { For, Switch, Match, Show, createEffect, createSignal } from "solid-js";
import { createStore, produce, unwrap } from "solid-js/store";
import html from "solid-js/html";

// try { await deleteDB("bedrock-messages"); } catch (e) { console.warn(e);}
const db = await openDB("bedrock-messages", 2, {
  upgrade(db, oldVersion, newVersion, transaction) {
    // Version 1: Original schema
    if (oldVersion < 1) {
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
      tables.messages.createIndex("parentId", "parentId"); // Added in v2, but include for fresh installs
      tables.threads.createIndex("agentId", "agentId");

      tables.resources.createIndex("agentId", "agentId");
      tables.resources.createIndex("threadId", "threadId");
      tables.resources.createIndex("messageId", "messageId");
    }

    // Version 2: Add parentId index for branching support (for upgrades from v1)
    if (oldVersion >= 1 && oldVersion < 2) {
      const msgStore = transaction.objectStore("messages");
      if (!msgStore.indexNames.contains("parentId")) {
        msgStore.createIndex("parentId", "parentId", { unique: false });
      }
    }
  },
});

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

if (!(await db.count("agents"))) {
  let r = await db.add("agents", {
    name: "default",
    systemPrompt:
      "You are honest. When you are uncertain about something, or if your tools aren't working right, you let the user know. You write in brief, artistic prose, without any *markdown*, lists, bullet points, emojis or em-dashes (—).",
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
            source: { type: "string", description: "The JavaScript code to execute. Eg: 2+2" },
            language: {
              type: "string",
              description: "The programming language of the code (e.g., 'javascript', 'html').",
              default: "javascript",
            },
          },
          required: ["source"],
        },
      },
    },
  },
  {
    fn: think,
    toolSpec: {
      name: "think",
      description: "Use this tool to create a dedicated thinking space for complex reasoning. Use it when you need to analyze information, plan steps, or work through problems before providing a final answer.",
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

/**
 * Branch navigation component - shows arrows to navigate between sibling messages
 */
function BranchNav(props) {
  // props: { tree, messageId, onSwitch }
  const siblings = () => {
    if (!props.tree || !props.messageId) return [props.messageId];
    return getSiblings(props.tree, props.messageId);
  };
  const hasSiblings = () => siblings().length > 1;
  const currentIndex = () => siblings().indexOf(props.messageId);

  const canGoPrev = () => currentIndex() > 0;
  const canGoNext = () => currentIndex() < siblings().length - 1;

  const goPrev = () => {
    if (canGoPrev()) {
      props.onSwitch(siblings()[currentIndex() - 1]);
    }
  };

  const goNext = () => {
    if (canGoNext()) {
      props.onSwitch(siblings()[currentIndex() + 1]);
    }
  };

  return html`
    <${Show} when=${hasSiblings}>
      <span class="branch-nav d-inline-flex align-items-center gap-1 small text-muted ms-2">
        <button
          type="button"
          class="btn btn-sm btn-link p-0 text-muted"
          disabled=${() => !canGoPrev()}
          onClick=${goPrev}
          title="Previous version">
          <i class="bi bi-chevron-left"></i>
        </button>
        <span>${() => currentIndex() + 1}/${() => siblings().length}</span>
        <button
          type="button"
          class="btn btn-sm btn-link p-0 text-muted"
          disabled=${() => !canGoNext()}
          onClick=${goNext}
          title="Next version">
          <i class="bi bi-chevron-right"></i>
        </button>
      </span>
    <//>
  `;
}

/**
 * Inline edit textarea component for editing user messages
 */
function EditableMessage(props) {
  let textareaRef;

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      props.onSave(textareaRef.value);
    } else if (e.key === "Escape") {
      props.onCancel();
    }
  };

  // Auto-focus on mount
  createEffect(() => {
    if (textareaRef) {
      textareaRef.focus();
      textareaRef.select();
    }
  });

  return html`
    <div class="edit-message-container">
      <textarea
        ref=${el => textareaRef = el}
        class="form-control form-control-sm mb-2"
        rows="3"
        onKeyDown=${handleKeyDown}
      >${() => props.text}</textarea>
      <div class="d-flex gap-2">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          onClick=${e => props.onSave(textareaRef.value)}>
          Save & Submit
        </button>
        <button
          type="button"
          class="btn btn-sm btn-secondary"
          onClick=${e => props.onCancel()}>
          Cancel
        </button>
      </div>
    </div>
  `;
}

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
      // Check if this message is being edited
      const isEditing = () => props.editingId === props.messageId;

      return html`
        <${Show} when=${isEditing} fallback=${html`
          <div class="small rounded p-2 mb-3 text-dark bg-secondary-subtle d-inline-block text-pre">${() => props.content.text}</div>
        `}>
          <${EditableMessage}
            text=${() => props.content.text}
            onSave=${text => props.onSave?.(props.messageId, text)}
            onCancel=${e => props.onCancel?.()} />
        <//>
      `;
    } else if (props.role === "assistant") {
      return html`
        <div class="small p-2 mb-3 text-pre ">${() => props.content.text}</div>
      `;
    }
  } else if (props.content.reasoningContent || props.content.toolUse?.name === "think") {
    return html`
      <details class="small rounded border p-2 mb-3">
        <summary class="cursor-pointer text-dark">View Reasoning</summary>
        <p class="my-2 text-muted">${() => props.content.reasoningContent?.reasoningText?.text || parseJSON(props.content.toolUse?.input)?.thought}</p>
      </details>
    `;
  } else if (props.content.toolUse) {
    return html`
      <details class="small rounded border p-2 mb-3">
        <summary class="cursor-pointer text-dark">${() => props.content.toolUse.name}</summary>
        <div class="my-2 text-muted text-pre">
          ${() => JSON.stringify(parseJSON(props.content.toolUse.input || "{}"), null, 2)}
          <hr />
          ${() => JSON.stringify(findToolResult(props.messages, props.content.toolUse.toolUseId) || {}, null, 2)}
        </div>
      </details>
    `;
  }
}

function setSearchParams(obj) {
  const searchParams = new URLSearchParams(window.location.search);
  for (let key in obj) {
    const value = obj[key];
    if (![null, undefined].includes(value)) searchParams.set(key, obj[key]);
  }
  const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
  window.history.replaceState({}, "", newUrl);
}

function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const urlParams = Object.fromEntries(searchParams.entries());
  const { agent, sendMessage, switchBranch, params } = useAgent(urlParams, db);
  createEffect(() => setSearchParams(params));

  // Editing state for inline message editing
  const [editingMessageId, setEditingMessageId] = createSignal(null);

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

  // Start editing a message
  function startEdit(messageId) {
    setEditingMessageId(messageId);
  }

  // Cancel editing
  function cancelEdit() {
    setEditingMessageId(null);
  }

  // Save edited message (creates a new branch)
  async function saveEdit(messageId, newText) {
    const message = agent.messageTree?.nodes.get(messageId)?.message;
    if (!message) return;

    const originalText = message.content.find(c => c.text)?.text || "";
    if (newText && newText !== originalText) {
      const form = document.getElementById("inputForm");
      const modelId = form?.modelId?.value || "us.anthropic.claude-haiku-4-5-20251001-v1:0";
      const reasoningMode = form?.reasoningMode?.checked || false;
      await sendMessage(newText, [], modelId, reasoningMode, messageId);
    }
    setEditingMessageId(null);
  }

  return html`
    <style>
      .message-block .message-controls {
        visibility: hidden;
      }
      .message-block:hover .message-controls {
        visibility: visible;
      }
    </style>
    <div class="container my-5">
      <${For} each=${() => agent.messages}>
        ${message => html`
          <div class="message-block mb-3">
            <${For} each=${() => message.content}>
              ${content => html`
                <${MessageContent}
                  role=${message.role}
                  content=${content}
                  messages=${() => agent.messages}
                  messageId=${message.id}
                  editingId=${editingMessageId}
                  onSave=${saveEdit}
                  onCancel=${cancelEdit} />
              `}
            <//>
            <!-- Controls below message, visible on hover -->
            <${Show} when=${() => message.id && agent.messageTree && editingMessageId() !== message.id}>
              <div class="message-controls d-flex align-items-center gap-2">
                <${BranchNav}
                  tree=${() => agent.messageTree}
                  messageId=${message.id}
                  onSwitch=${switchBranch} />
                <${Show} when=${() => message.role === "user"}>
                  <button
                    type="button"
                    class="btn btn-sm btn-link p-0 text-muted"
                    onClick=${e => startEdit(message.id)}
                    title="Edit message">
                    <i class="bi bi-pencil"></i>
                  </button>
                <//>
              </div>
            <//>
          </div>
        `}
      <//>

      <form
        id="inputForm"
        onSubmit=${handleSubmit}
        class="shadow-sm bg-white border rounded">
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

            <label
              for="userFiles"
              class="btn btn-sm btn-secondary">
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
              <label
                class="form-check-label"
                for="reasoningMode">
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
              <optgroup label="AWS Bedrock">
                <option value="global.anthropic.claude-opus-4-5-20251101-v1:0">Opus 4.5</option>
                <option value="us.anthropic.claude-sonnet-4-5-20250929-v1:0">Sonnet 4.5</option>
                <option
                  value="us.anthropic.claude-haiku-4-5-20251001-v1:0"
                  selected>
                  Haiku 4.5
                </option>
              </optgroup>

              <optgroup label="Google Vertex">
                <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              </optgroup>
            </select>
            <button
              type="submit"
              class="btn btn-sm btn-dark">
              Send
            </button>
          </div>
        </div>
      </form>
    </div>
  `;
}

// =================================================================================
// 4. CORE LOGIC & STATE
// =================================================================================

function useAgent({ agentId, threadId }, db, tools = TOOLS) {
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
    tools: [],
    messages: [],
    // Branching support
    messageTree: null,
    activePath: [],
    activeLeafId: null,
  });

  // load history
  createEffect(async () => {
    if (!params.threadId) return;
    const history = await db.getAllFromIndex("messages", "threadId", params.threadId);
    if (!history?.length) return;
    const thread = await db.get("threads", params.threadId);
    const name = thread?.name || "Untitled";

    // Build message tree for branching support
    const tree = buildMessageTree(history);
    const path = getMostRecentPath(tree);
    const leafId = path.length > 0 ? path[path.length - 1] : null;

    // Get messages for the active path only
    const messages = path.map(id => {
      const node = tree.nodes.get(id);
      return node ? node.message : null;
    }).filter(Boolean);

    setAgent({
      messages,
      thread: { name },
      messageTree: tree,
      activePath: path,
      activeLeafId: leafId,
    });
  });

  // save changes when store updates
  createEffect(async () => {
    // only save changes if we've loaded an agent
    if (!params.agentId || !agent.id) return;
    await upsert(db, "agents", {
      id: params.agentId,
      name: agent.name,
      systemPrompt: agent.systemPrompt,
      tools: agent.tools.map(t => t.toolSpec.name),
    });
    // only save thread if we've loaded one
    if (!params.threadId || !agent.thread.id) return;
    await upsert(db, "threads", {
      id: params.threadId,
      agentId: params.agentId,
      name: agent.thread.name,
    });
  });
  async function sendMessage(text, files = [], modelId, reasoningMode, forkFromId = null) {
    setAgent("loading", true);

    if (!params.threadId) {
      setAgent("thread", "name", "Untitled");
      const thread = { agentId, name: agent.thread.name };
      const threadId = await db.add("threads", thread);
      setParams("threadId", threadId);
    }

    const record = await db.get("agents", +params.agentId);
    const agentTools = tools.filter(t => record.tools.includes(t.toolSpec.name));

    const client = await getConverseClient(modelId.includes("gemini") ? "google" : "aws");
    const content = await getMessageContent(text, files);

    // Determine parent for the new message (branching support)
    let parentId = null;
    if (forkFromId !== null) {
      // Editing: new message has same parent as the message being edited
      const editedMsg = agent.messageTree?.nodes.get(forkFromId)?.message;
      parentId = editedMsg?.parentId ?? null;
    } else if (agent.activeLeafId !== null) {
      // Normal send: parent is the current leaf
      parentId = agent.activeLeafId;
    }

    const userMessage = {
      role: "user",
      content,
      parentId,
      createdAt: Date.now(),
    };

    // Save user message to DB immediately to get its ID
    const savedId = await db.add("messages", {
      ...userMessage,
      agentId: params.agentId,
      threadId: params.threadId,
    });
    userMessage.id = savedId;

    // Rebuild tree and update active path
    const allMessages = await db.getAllFromIndex("messages", "threadId", params.threadId);
    const tree = buildMessageTree(allMessages);
    const newPath = extendPath(tree, getPathToMessage(tree, userMessage.id));
    const pathMessages = newPath.map(id => tree.nodes.get(id)?.message).filter(Boolean);

    setAgent({
      id: record.id,
      thread: { id: params.threadId },
      modelId,
      reasoningMode,
      name: record.name,
      systemPrompt: record.systemPrompt,
      resources: record.resources,
      tools: agentTools,
      messages: pathMessages,
      messageTree: tree,
      activePath: newPath,
      activeLeafId: userMessage.id,
    });

    // Run agent and save messages incrementally with parentId tracking
    await runAgentWithBranching(agent, setAgent, client, userMessage.id, params, db);
    setAgent("loading", false);
  }

  // Switch to a different branch
  function switchBranch(newMessageId) {
    const tree = agent.messageTree;
    if (!tree) return;

    // Build path to the new message, then extend to leaf
    const pathToMessage = getPathToMessage(tree, newMessageId);
    const fullPath = extendPath(tree, pathToMessage);
    const newLeafId = fullPath.length > 0 ? fullPath[fullPath.length - 1] : null;
    const pathMessages = fullPath.map(id => tree.nodes.get(id)?.message).filter(Boolean);

    setAgent({
      activePath: fullPath,
      activeLeafId: newLeafId,
      messages: pathMessages,
    });
  }

  return { agent, params, setAgent, sendMessage, switchBranch };
}

// =================================================================================
// 5. TOOL HANDLING
// =================================================================================

async function getConverseClient(type = "aws") {
  if (type === "aws") {
    const config = await withStorage(getAwsConfig, localStorage, "aws-config");
    const client = new BedrockRuntimeClient(config);
    const send = input => client.send(new ConverseStreamCommand(input));
    return { client, send };
  }

  if (type === "google") {
    const config = await withStorage(getGoogleConfig, localStorage, "google-config");
    return getGeminiClient(new GoogleGenAI(config));
  }
}

/**
 * Creates a Gemini client wrapper for use with the agent.
 * Drop-in replacement: `const { send } = getGeminiClient(geminiClient)`
 * @param {GoogleGenAI} client - Initialized @google/genai client
 */
export function getGeminiClient(client) {
  const toB64 = b => btoa(b.reduce((s, x) => s + String.fromCharCode(x), ""));
  const MIME = { png: "image/png", jpeg: "image/jpeg", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf" };

  // Map to track toolUseId -> function name for the current request
  const toolUseIdToName = new Map();

  const toGeminiPart = b => {
    if (b.text) return { text: b.text };
    if (b.image) return { inlineData: { data: toB64(b.image.source.bytes), mimeType: MIME[b.image.format] } };
    if (b.document) return { inlineData: { data: toB64(b.document.source.bytes), mimeType: MIME[b.document.format] || "application/octet-stream" } };
    if (b.toolUse) {
      // Track the mapping for later use in toolResult
      toolUseIdToName.set(b.toolUse.toolUseId, b.toolUse.name);
      const args = typeof b.toolUse.input === "string" ? JSON.parse(b.toolUse.input) : b.toolUse.input;
      return { functionCall: { name: b.toolUse.name, args, id: b.toolUse.toolUseId } };
    }
    if (b.toolResult) {
      const c = b.toolResult.content?.[0];
      const name = toolUseIdToName.get(b.toolResult.toolUseId) || b.toolResult.toolUseId;
      return { functionResponse: { id: b.toolResult.toolUseId, name, response: c?.json ?? { output: c?.text } } };
    }
  };

  async function* stream(input) {
    // Clear the map for each new request
    toolUseIdToName.clear();

    const geminiReq = {
      model: input.modelId,
      contents: input.messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: m.content.map(toGeminiPart).filter(Boolean) })),
      config: {
        systemInstruction: input.system?.find(s => s.text)?.text,
        tools: input.toolConfig?.tools
          ?.filter(t => t.toolSpec)
          .map(t => ({
            functionDeclarations: [
              {
                name: t.toolSpec.name,
                description: t.toolSpec.description,
                parametersJsonSchema: t.toolSpec.inputSchema?.json,
              },
            ],
          })),
        ...(input.additionalModelRequestFields?.thinking && {
          thinkingConfig: { thinkingBudget: input.additionalModelRequestFields.thinking.budget_tokens },
        }),
      },
    };

    const response = await client.models.generateContentStream(geminiReq);
    yield { messageStart: { role: "assistant" } };

    let idx = 0,
      active = null,
      toolNum = 0;

    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      const done = chunk.candidates?.[0]?.finishReason;

      for (const p of parts) {
        let type, start, delta;

        if (p.thought && p.text != null) {
          type = "reasoning";
          delta = { reasoningContent: { text: p.text, ...(p.thoughtSignature && { signature: p.thoughtSignature }) } };
        } else if (p.text != null) {
          type = "text";
          delta = { text: p.text };
        } else if (p.functionCall) {
          type = "tool";
          const id = `gemini_${toolNum++}`;
          start = { toolUse: { toolUseId: id, name: p.functionCall.name } };
          delta = { toolUse: { input: JSON.stringify(p.functionCall.args ?? {}) } };
        } else continue;

        if (type !== active) {
          if (active) yield { contentBlockStop: { contentBlockIndex: idx++ } };
          if (start) yield { contentBlockStart: { contentBlockIndex: idx, start } };
          active = type;
        }
        yield { contentBlockDelta: { contentBlockIndex: idx, delta } };
      }

      if (done) {
        if (active) yield { contentBlockStop: { contentBlockIndex: idx } };
        yield { messageStop: { stopReason: parts.some(p => p.functionCall) ? "tool_use" : "end_turn" } };
      }
    }
  }

  return { client, send: input => Promise.resolve({ stream: stream(input) }) };
}

async function withStorage(getConfig, storage, key) {
  try {
    const config = await storage.getItem(key);
    if (!config) throw new Error("No config found");
    return JSON.parse(config);
  } catch (error) {
    const config = await getConfig();
    await storage.setItem(key, JSON.stringify(config));
    return config;
  }
}

function getGoogleConfig(prompt = window.prompt) {
  const apiKey = prompt("Google GenAI API Key:");
  return { apiKey };
}

function getAwsConfig(prompt = window.prompt) {
  const region = prompt("AWS region [us-east-1]:");
  const accessKeyId = prompt("AWS Access Key ID:");
  const secretAccessKey = prompt("AWS Secret Access Key:");
  const sessionToken = prompt("AWS Session Token [optional]:");
  return {
    region: region || "us-east-1",
    credentials: { accessKeyId, secretAccessKey, sessionToken: sessionToken || undefined },
  };
}

function getConverseCommand(config) {
  const cachePoint = { type: "default" };
  const additionalModelRequestFields = {};
  if (config.reasoningMode) {
    additionalModelRequestFields.thinking = { type: "enabled", budget_tokens: +32_000 };
  }
  const tools = config.tools.map(({ toolSpec }) => ({ toolSpec })).filter(Boolean);

  return {
    modelId: config.modelId,
    messages: config.messages,
    system: [{ text: config.systemPrompt }, { cachePoint }],
    toolConfig: { tools: [...tools, { cachePoint }] },
    additionalModelRequestFields,
  };
}

/**
 * Runs the agent loop with branching support, saving messages with parentId tracking.
 * @param {any} store - Agent store with messages and tools
 * @param {any} setStore - Function to update the store
 * @param {any} client - Converse client with send() method
 * @param {number} lastMessageId - ID of the last message (parent for first assistant message)
 * @param {any} params - Store params with agentId and threadId
 * @param {any} db - IndexedDB database instance
 */
async function runAgentWithBranching(store, setStore, client, lastMessageId, params, db) {
  let currentParentId = lastMessageId;
  const tools = {};
  for (const tool of store.tools) {
    tools[tool.toolSpec.name] = tool.fn;
  }

  let done = false;
  while (!done) {
    // Prepare messages for model (only role/content)
    const input = getConverseCommand({
      ...store,
      messages: store.messages.map(({ role, content }) => ({ role, content })),
    });
    const output = await client.send(input);

    // Create assistant message with parentId
    const assistantMessage = {
      role: "assistant",
      content: [],
      parentId: currentParentId,
      createdAt: Date.now(),
    };
    setStore("messages", store.messages.length, assistantMessage);

    for await (const message of output.stream) {
      setStore(produce(s => processContentBlock(s, message)));

      const stopReason = message.messageStop?.stopReason;
      if (stopReason === "end_turn") {
        // Save assistant message to DB
        const savedId = await db.add("messages", {
          ...unwrap(store.messages.at(-1)),
          agentId: params.agentId,
          threadId: params.threadId,
        });
        // Update the message in store with its ID
        setStore("messages", store.messages.length - 1, "id", savedId);
        setStore("activeLeafId", savedId);
        currentParentId = savedId;
        done = true;
      } else if (stopReason === "tool_use") {
        // Save assistant message to DB first
        const assistantSavedId = await db.add("messages", {
          ...unwrap(store.messages.at(-1)),
          agentId: params.agentId,
          threadId: params.threadId,
        });
        setStore("messages", store.messages.length - 1, "id", assistantSavedId);

        // Execute tools and create tool results message
        const toolUses = store.messages.at(-1).content;
        const toolResultsMessage = {
          ...(await getToolResults(toolUses, tools)),
          parentId: assistantSavedId,
          createdAt: Date.now(),
        };
        setStore("messages", store.messages.length, toolResultsMessage);

        // Save tool results message to DB
        const toolResultsSavedId = await db.add("messages", {
          ...unwrap(toolResultsMessage),
          agentId: params.agentId,
          threadId: params.threadId,
        });
        setStore("messages", store.messages.length - 1, "id", toolResultsSavedId);
        currentParentId = toolResultsSavedId;
      }
    }
  }

  // Rebuild tree after all messages are saved
  const allMessages = await db.getAllFromIndex("messages", "threadId", params.threadId);
  const tree = buildMessageTree(allMessages);
  const path = getMostRecentPath(tree);
  setStore("messageTree", tree);
  setStore("activePath", path);
}

/**
 * Parses and updates the current message content block based on the incoming message update.
 * @param {*} s current store state
 * @param {*} message message update from the model
 * @returns {string} Stop reason if complete, otherwise false
 */
function processContentBlock(s, message) {
  const { contentBlockStart, contentBlockDelta, contentBlockStop } = message;
  const toolUse = contentBlockStart?.start?.toolUse;
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
  const documentTypes = ["pdf", "csv", "doc", "docx", "xls", "xlsx", "html", "txt", "md"];
  const imageTypes = ["png", "jpg", "jpeg", "gif", "webp"];
  const isText = file.type.startsWith("text/") || file.type.includes("json") || file.type.includes("xml");
  const fileExtension = file.name.split(".").pop().toLowerCase();

  let format = fileExtension;
  if (isText && !documentTypes.includes(fileExtension)) format = "txt";
  if (fileExtension === "htm") format = "html";
  if (fileExtension === "jpeg") format = "jpg";

  const type = imageTypes.includes(format) ? "image" : documentTypes.includes(format) ? "document" : null;
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const name = file.name
    .replace(/[^A-Z0-9 _\-\(\)\[\]]/gi, "_")
    .replace(/\s+/g, " ")
    .trim();

  if (type) {
    return {
      [type]: { format, name, source: { bytes } },
    };
  }
}

/**
 * Executes the tools requested by the model and returns a single "user" role message
 * containing all the results.
 */
async function getToolResults(toolUseContent, tools) {
  const toolUses = toolUseContent.map(c => c.toolUse).filter(Boolean);
  const content = await Promise.all(toolUses.map(t => getToolResult(t, tools)));
  return { role: "user", content };
}

async function getToolResult(toolUse, tools) {
  let { toolUseId, name, input } = toolUse;
  try {
    const result = await tools?.[name]?.(input);
    const content = [{ json: { result } }];
    return { toolResult: { toolUseId, content } };
  } catch (error) {
    console.error("Tool error:", error);
    const result = error.stack || error.message || String(error);
    const content = [{ json: { result } }];
    return { toolResult: { toolUseId, content } };
  }
}

function code({ language = "js", source, timeout = 5000 }) {
  return new Promise(resolve => {
    const logs = [];
    const frame = document.createElement("iframe");
    frame.sandbox = "allow-scripts allow-same-origin"; // isolated; only scripts allowed
    frame.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:0;height:0;border:0";
    document.body.appendChild(frame);

    const onMsg = e => {
      if (e.source !== frame.contentWindow) return;
      const d = e.data || {};
      if (d.type === "log") logs.push(String(d.msg));
      if (d.type === "done") cleanup();
    };
    window.addEventListener("message", onMsg);

    const cleanup = () => {
      clearTimeout(kill);
      window.removeEventListener("message", onMsg);
      const doc = frame.contentDocument || frame.contentWindow.document;
      const b = doc.body,
        de = doc.documentElement;
      const height = Math.max(b?.scrollHeight || 0, b?.offsetHeight || 0, de?.clientHeight || 0, de?.scrollHeight || 0, de?.offsetHeight || 0);
      const html = de?.outerHTML || "";
      frame.remove();
      resolve({ logs, height, html });
    };

    // tiny bridge: forward console + errors
    const bridge = `
      (()=>{
        const send=(t,m)=>parent.postMessage({type:t,msg:m},"*");
        ["log","warn","error","info","debug"].forEach(k=>{
          const o=console[k]; console[k]=(...a)=>{try{send("log",a.join(" "))}catch{}; o&&o.apply(console,a);};
        });
        addEventListener("error",e=>send("log",String(e.message||e.error||"error")));
        addEventListener("unhandledrejection",e=>send("log","UnhandledRejection: "+(e?.reason?.message||e?.reason||"")));
      })();
    `;

    const jsDoc = `<!doctype html><meta charset=utf-8>
      <script>${bridge}</script>
      <script type="module">
        ${source || ""}
        ;parent.postMessage({type:"done"},"*");
      </script>`;

    const htmlDoc = `<!doctype html><meta charset=utf-8>
      <script>${bridge}</script>
      ${source || ""}
      <script async>addEventListener("load",()=>parent.postMessage({type:"done"},"*"));</script>`;

    const kill = setTimeout(cleanup, timeout);
    frame.srcdoc = !language || ["js", "javascript"].includes(language) ? jsDoc : htmlDoc;
  });
}

function think(input) {
  return "Thinking complete.";
}

// =================================================================================
// 6. UTILITIES
// =================================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

// =================================================================================
// 7. BRANCHING UTILITIES
// =================================================================================

/**
 * Build a tree structure from a flat array of messages.
 * @param {Array} messages - Array of { id, parentId, role, content, createdAt }
 * @returns {{ rootIds: number[], nodes: Map<number, { message: object, childIds: number[] }> }}
 */
export function buildMessageTree(messages) {
  const nodes = new Map();
  const rootIds = [];

  // First pass: create nodes
  for (const msg of messages) {
    nodes.set(msg.id, { message: msg, childIds: [] });
  }

  // Second pass: build parent-child relationships
  for (const msg of messages) {
    if (msg.parentId === null || msg.parentId === undefined) {
      rootIds.push(msg.id);
    } else if (nodes.has(msg.parentId)) {
      nodes.get(msg.parentId).childIds.push(msg.id);
    }
  }

  // Sort children by createdAt
  for (const [_, node] of nodes) {
    node.childIds.sort((a, b) => nodes.get(a).message.createdAt - nodes.get(b).message.createdAt);
  }

  // Sort rootIds by createdAt
  rootIds.sort((a, b) => nodes.get(a).message.createdAt - nodes.get(b).message.createdAt);

  return { rootIds, nodes };
}

/**
 * Get the path from root to leaf following the most recent (newest) child at each branch point.
 * @param {{ rootIds: number[], nodes: Map }} tree - Tree structure from buildMessageTree
 * @returns {number[]} Array of message IDs from root to leaf
 */
export function getMostRecentPath(tree) {
  if (tree.rootIds.length === 0) return [];

  const path = [];
  // Start with the most recent root (last in sorted array)
  let currentId = tree.rootIds[tree.rootIds.length - 1];

  while (currentId !== undefined) {
    path.push(currentId);
    const node = tree.nodes.get(currentId);
    if (!node || node.childIds.length === 0) break;
    // Follow most recent child (last in sorted array)
    currentId = node.childIds[node.childIds.length - 1];
  }

  return path;
}

/**
 * Get all siblings of a message (including itself), sorted by createdAt.
 * @param {{ rootIds: number[], nodes: Map }} tree - Tree structure from buildMessageTree
 * @param {number} messageId - ID of the message
 * @returns {number[]} Array of sibling message IDs
 */
export function getSiblings(tree, messageId) {
  const node = tree.nodes.get(messageId);
  if (!node) return [messageId];

  const parentId = node.message.parentId;

  if (parentId === null || parentId === undefined) {
    // Root message - siblings are other roots
    return tree.rootIds;
  }

  const parentNode = tree.nodes.get(parentId);
  return parentNode ? parentNode.childIds : [messageId];
}

/**
 * Build the path from root to a specific message by following parent links.
 * @param {{ rootIds: number[], nodes: Map }} tree - Tree structure from buildMessageTree
 * @param {number} messageId - ID of the target message
 * @returns {number[]} Array of message IDs from root to the target message
 */
export function getPathToMessage(tree, messageId) {
  const path = [];
  let currentId = messageId;

  while (currentId !== null && currentId !== undefined) {
    path.unshift(currentId);
    const node = tree.nodes.get(currentId);
    if (!node) break;
    currentId = node.message.parentId;
  }

  return path;
}

/**
 * Extend a partial path to a full path by following the most recent children.
 * @param {{ rootIds: number[], nodes: Map }} tree - Tree structure from buildMessageTree
 * @param {number[]} path - Partial path to extend
 * @returns {number[]} Extended path to leaf
 */
export function extendPath(tree, path) {
  if (path.length === 0) return [];

  const extended = [...path];
  let currentId = extended[extended.length - 1];

  while (true) {
    const node = tree.nodes.get(currentId);
    if (!node || node.childIds.length === 0) break;
    // Follow most recent child
    currentId = node.childIds[node.childIds.length - 1];
    extended.push(currentId);
  }

  return extended;
}
