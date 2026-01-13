// =================================================================================
// HOOKS.JS - Chat V2 Logic (Database Adapters, Tools, State Management)
// =================================================================================

import { openDB } from "idb";
import { createEffect } from "solid-js";
import { createStore, produce, unwrap } from "solid-js/store";
import mammoth from "mammoth";
import { docxReplace } from "/utils/docx.js";

import { tools as toolSpecs, systemPrompt as defaultSystemPrompt } from "../chat/config.js";

// =================================================================================
// DATABASE ADAPTER INTERFACE
// =================================================================================

/**
 * IndexedDB adapter - stores data locally in the browser
 */
class IndexedDBAdapter {
  constructor(db) {
    this.db = db;
  }

  static async create() {
    const db = await openDB("chat-v2-messages", 1, {
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

    const adapter = new IndexedDBAdapter(db);
    await adapter.ensureDefaultAgent();
    return adapter;
  }

  async ensureDefaultAgent() {
    if (!(await this.db.count("agents"))) {
      await this.db.add("agents", {
        name: "Ada",
        tools: ["search", "browse", "code", "editor", "think"],
        systemPrompt: null, // Will use fallback from config.js
        resources: [],
      });
    }
  }

  // Agents
  async getAgent(id) {
    return this.db.get("agents", id);
  }

  async getAgents() {
    return this.db.getAll("agents");
  }

  async createAgent(data) {
    const id = await this.db.add("agents", data);
    return { ...data, id };
  }

  async updateAgent(id, data) {
    const existing = await this.db.get("agents", id);
    if (!existing) return null;
    const updated = { ...existing, ...data, id };
    await this.db.put("agents", updated);
    return updated;
  }

  // Threads
  async getThread(id) {
    return this.db.get("threads", id);
  }

  async getThreads(agentId = null) {
    if (agentId) {
      return this.db.getAllFromIndex("threads", "agentId", agentId);
    }
    return this.db.getAll("threads");
  }

  async createThread(data) {
    const id = await this.db.add("threads", { ...data, createdAt: Date.now(), updatedAt: Date.now() });
    return { ...data, id, createdAt: Date.now(), updatedAt: Date.now() };
  }

  async updateThread(id, data) {
    const existing = await this.db.get("threads", id);
    if (!existing) return null;
    const updated = { ...existing, ...data, id, updatedAt: Date.now() };
    await this.db.put("threads", updated);
    return updated;
  }

  async deleteThread(id) {
    // Delete all messages in thread first
    const messages = await this.db.getAllFromIndex("messages", "threadId", id);
    for (const msg of messages) {
      await this.db.delete("messages", msg.id);
    }
    await this.db.delete("threads", id);
  }

  // Messages
  async getMessages(threadId) {
    return this.db.getAllFromIndex("messages", "threadId", threadId);
  }

  async addMessage(threadId, data) {
    const message = { ...data, threadId };
    const id = await this.db.add("messages", message);
    return { ...message, id };
  }
}

/**
 * Server API adapter - stores data on the backend
 */
class ServerAdapter {
  constructor(baseUrl = "/api") {
    this.baseUrl = baseUrl;
  }

  static async create(baseUrl) {
    return new ServerAdapter(baseUrl);
  }

  async #fetch(path, options = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(error.error || `API error: ${res.status}`);
    }
    return res.json();
  }

  // Agents
  async getAgent(id) {
    return this.#fetch(`/agents/${id}`);
  }

  async getAgents() {
    return this.#fetch("/agents");
  }

  async createAgent(data) {
    return this.#fetch("/agents", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateAgent(id, data) {
    return this.#fetch(`/agents/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Threads
  async getThread(id) {
    return this.#fetch(`/threads/${id}`);
  }

  async getThreads(agentId = null) {
    const result = await this.#fetch("/threads");
    const threads = result.data || result;
    if (agentId) {
      return threads.filter((t) => t.agentId === agentId);
    }
    return threads;
  }

  async createThread(data) {
    return this.#fetch("/threads", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateThread(id, data) {
    return this.#fetch(`/threads/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteThread(id) {
    return this.#fetch(`/threads/${id}`, { method: "DELETE" });
  }

  // Messages
  async getMessages(threadId) {
    return this.#fetch(`/threads/${threadId}/messages`);
  }

  async addMessage(threadId, data) {
    return this.#fetch(`/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}

/**
 * Factory function to create database adapter
 * @param {string} type - "server" (default) or "indexeddb"
 * @returns {Promise<IndexedDBAdapter|ServerAdapter>}
 */
async function createDB(type = "server") {
  if (type === "indexeddb") {
    return IndexedDBAdapter.create();
  }

  // Try server first, fall back to indexeddb on error
  try {
    const adapter = await ServerAdapter.create();
    // Verify server is accessible by fetching agents
    await adapter.getAgents();
    return adapter;
  } catch (error) {
    console.warn("Server adapter failed, falling back to IndexedDB:", error.message);
    return IndexedDBAdapter.create();
  }
}

// Singleton for router compatibility
let dbPromise = null;
export async function getDB(type = "server") {
  if (!dbPromise) {
    dbPromise = createDB(type);
  }
  return dbPromise;
}

// =================================================================================
// TOOL DEFINITIONS
// =================================================================================

export const TOOLS = [
  {
    fn: search,
    toolSpec: toolSpecs.find((t) => t.toolSpec.name === "search")?.toolSpec,
  },
  {
    fn: browse,
    toolSpec: toolSpecs.find((t) => t.toolSpec.name === "browse")?.toolSpec,
  },
  {
    fn: code,
    toolSpec: toolSpecs.find((t) => t.toolSpec.name === "code")?.toolSpec,
  },
  {
    fn: editor,
    toolSpec: toolSpecs.find((t) => t.toolSpec.name === "editor")?.toolSpec,
  },
  {
    fn: think,
    toolSpec: toolSpecs.find((t) => t.toolSpec.name === "think")?.toolSpec,
  },
  {
    fn: data,
    toolSpec: toolSpecs.find((t) => t.toolSpec.name === "data")?.toolSpec,
  },
  {
    fn: docxTemplate,
    toolSpec: toolSpecs.find((t) => t.toolSpec.name === "docxTemplate")?.toolSpec,
  },
].filter((t) => t.toolSpec);

// =================================================================================
// CORE LOGIC & STATE - useAgent Hook
// =================================================================================

export function useAgent({ agentId, threadId }, db, tools = TOOLS) {
  agentId = +agentId || 1;
  threadId = +threadId || null;

  const [params, setParams] = createStore({ agentId, threadId });
  const [agent, setAgent] = createStore({
    id: null,
    name: null,
    systemPrompt: null,
    thread: {
      id: null,
      name: null,
    },
    modelId: null,
    reasoningMode: false,
    loading: false,
    tools: [],
    messages: [],
  });

  // Thread list for sidebar
  const [threads, setThreads] = createStore([]);

  // Load threads list for sidebar
  async function loadThreads() {
    if (!db) return;
    try {
      const threadsList = await db.getThreads(params.agentId);
      const sorted = threadsList.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 20);
      setThreads(sorted);
    } catch (error) {
      console.error("Failed to load threads:", error);
    }
  }

  // Update thread (for title editing)
  async function updateThread(threadId, updates) {
    if (!db) return;
    try {
      await db.updateThread(threadId, updates);
      // Update local state if it's the current thread
      if (threadId === params.threadId) {
        setAgent("thread", "name", updates.name);
      }
      await loadThreads();
    } catch (error) {
      console.error("Failed to update thread:", error);
    }
  }

  // Delete thread
  async function deleteThread(threadId) {
    if (!db) return;
    try {
      await db.deleteThread(threadId);
      // If deleted current thread, clear state
      if (params.threadId === threadId) {
        setParams("threadId", null);
        setAgent("messages", []);
        setAgent("thread", { id: null, name: null });
      }
      await loadThreads();
    } catch (error) {
      console.error("Failed to delete thread:", error);
    }
  }

  // Load history from database adapter
  createEffect(async () => {
    if (!params.threadId) return;
    const history = await db.getMessages(params.threadId);
    if (!history?.length) return;
    const thread = await db.getThread(params.threadId);
    const name = thread?.name || "Untitled";
    const messages = history.map(({ role, content }) => ({ role, content }));
    setAgent({ messages, thread: { id: params.threadId, name } });
  });

  // Load threads on mount
  createEffect(async () => {
    if (db) await loadThreads();
  });

  // Save changes when store updates (skip global agents)
  createEffect(async () => {
    if (!params.agentId || !agent.id) return;
    // Check if this is a global agent (userId is null) - don't auto-save
    const record = await db.getAgent(params.agentId);
    if (record && record.userId === null) return;
    await db.updateAgent(params.agentId, {
      name: agent.name,
      tools: agent.tools.map((t) => t.toolSpec.name),
    });
    if (!params.threadId || !agent.thread.id) return;
    await db.updateThread(params.threadId, {
      agentId: params.agentId,
      name: agent.thread.name,
    });
  });

  async function sendMessage(text, files = [], modelId, reasoningMode) {
    setAgent("loading", true);

    if (!params.threadId) {
      setAgent("thread", "name", "Untitled");
      const thread = await db.createThread({ agentId, name: agent.thread.name });
      setParams("threadId", thread.id);
      setAgent("thread", "id", thread.id);
      await loadThreads();
    }

    const record = await db.getAgent(+params.agentId);
    const agentTools = tools.filter((t) => record.tools.includes(t.toolSpec.name));

    const content = await getMessageContent(text, files);
    const userMessage = { role: "user", content };

    setAgent({
      id: record.id,
      thread: { id: params.threadId, name: agent.thread.name },
      modelId,
      reasoningMode,
      name: record.name,
      systemPrompt: record.systemPrompt || null,
      tools: agentTools,
      messages: agent.messages.concat([userMessage]),
    });

    const messages = await runAgent(agent, setAgent);
    for (const message of messages) {
      const messageRecord = unwrap(message);
      messageRecord.agentId = params.agentId;
      await db.addMessage(params.threadId, messageRecord);
    }
    setAgent("loading", false);
  }

  // Generate thread title after first message
  async function generateThreadTitle(modelId) {
    if (!params.threadId || agent.thread.name !== "Untitled") return;

    try {
      const titleInstruction = {
        role: "user",
        content: [
          {
            text:
              "Based on the conversation, respond with ONLY a short title (max 30 characters). " +
              "Use only letters, numbers, and spaces. No quotes or punctuation. Just the title text.",
          },
        ],
      };

      const response = await fetch("/api/model", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: modelId || "us.anthropic.claude-haiku-4-5-20251001-v1:0",
          messages: [...agent.messages, titleInstruction],
          system: "Generate a concise title for this conversation.",
          thoughtBudget: 0,
          stream: false,
        }),
      });

      if (!response.ok) return;

      const json = await response.json();
      const rawTitle = json?.output?.message?.content?.[0]?.text || "";
      const title = rawTitle
        .replace(/[^a-zA-Z0-9 ]/g, "")
        .trim()
        .slice(0, 30);

      if (title) {
        await updateThread(params.threadId, { name: title });
      }
    } catch (error) {
      console.error("Failed to generate title:", error);
    }
  }

  return {
    agent,
    params,
    setAgent,
    setParams,
    sendMessage,
    threads,
    loadThreads,
    updateThread,
    deleteThread,
    generateThreadTitle,
  };
}

// =================================================================================
// API STREAMING & AGENT LOOP
// =================================================================================

async function* streamResponse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (line.trim()) {
        try {
          yield JSON.parse(line);
        } catch (e) {
          console.warn("Failed to parse line:", line);
        }
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer);
    } catch (e) {
      console.warn("Failed to parse remaining buffer:", buffer);
    }
  }
}

async function sendToModel(config) {
  // Get memory/workspace content from localStorage
  const getFileContents = (file) => localStorage.getItem("file:" + file) || "";
  const memoryFiles = ["_profile.txt", "_memory.txt", "_insights.txt", "_workspace.txt", "_knowledge.txt", "_patterns.txt"];
  const memoryContent = memoryFiles
    .map((file) => ({ file, contents: getFileContents(file) }))
    .filter((f) => f.contents)
    .map((f) => `<file name="${f.file}">${f.contents}</file>`)
    .join("\n");

  const time = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Use server-provided prompt or fallback to config.js default
  let system;
  if (config.systemPrompt) {
    system = config.systemPrompt.replace(/\{\{time\}\}/g, time).replace(/\{\{memory\}\}/g, memoryContent);
  } else {
    // Fallback to V1's systemPrompt from config.js
    system = defaultSystemPrompt({ time, main: memoryContent });
  }

  const tools = config.tools.map(({ toolSpec }) => ({ toolSpec })).filter(Boolean);
  const thoughtBudget = config.reasoningMode ? 32000 : 0;

  // Convert messages to API format - encode bytes as base64
  const messages = config.messages.map((msg) => ({
    role: msg.role,
    content: msg.content.map((c) => {
      if (c.image?.source?.bytes instanceof Uint8Array) {
        return {
          image: {
            ...c.image,
            source: { bytes: arrayBufferToBase64(c.image.source.bytes) },
          },
        };
      }
      if (c.document?.source?.bytes instanceof Uint8Array) {
        return {
          document: {
            ...c.document,
            source: { bytes: arrayBufferToBase64(c.document.source.bytes) },
          },
        };
      }
      return c;
    }),
  }));

  const response = await fetch("/api/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.modelId,
      messages,
      system,
      tools,
      thoughtBudget,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return { stream: streamResponse(response) };
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function runAgent(store, setStore) {
  const startingIndex = store.messages.length - 1;
  const tools = {};
  for (const tool of store.tools) {
    tools[tool.toolSpec.name] = tool.fn;
  }

  let done = false;
  while (!done) {
    const output = await sendToModel(store);
    const assistantMessage = { role: "assistant", content: [] };
    setStore("messages", store.messages.length, assistantMessage);

    for await (const message of output.stream) {
      // console.log(message);
      setStore(produce((s) => processContentBlock(s, message)));

      const stopReason = message.messageStop?.stopReason;
      if (stopReason === "end_turn") {
        done = true;
      } else if (stopReason === "tool_use") {
        const toolUses = store.messages.at(-1).content;
        const toolResultsMessage = await getToolResults(toolUses, tools, store, setStore);
        setStore("messages", store.messages.length, toolResultsMessage);
      }
    }
  }
  return store.messages.slice(startingIndex);
}

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
    } else if (text !== undefined) {
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
    if (block.text?.length === 0) {
      block.text += " ";
    }
  }
}

// =================================================================================
// FILE & MESSAGE HANDLING
// =================================================================================

async function getMessageContent(text, files) {
  const content = [];
  // Add attachments first (before text)
  if (files.length > 0) {
    for (const file of files) {
      const fileContent = await getContentBlock(file);
      if (fileContent) {
        content.push(fileContent);
      }
    }
  }
  // Text should be last
  content.push({ text });
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

// =================================================================================
// TOOL EXECUTION
// =================================================================================

async function getToolResults(toolUseContent, tools, store, setStore) {
  const toolUses = toolUseContent.map((c) => c.toolUse).filter(Boolean);
  const content = await Promise.all(toolUses.map((t) => getToolResult(t, tools, store, setStore)));
  return { role: "user", content };
}

async function getToolResult(toolUse, tools, store, setStore) {
  let { toolUseId, name, input } = toolUse;
  try {
    const result = await tools?.[name]?.(input, store, setStore);
    const content = [{ json: { results: result } }];
    return { toolResult: { toolUseId, content } };
  } catch (error) {
    console.error("Tool error:", error);
    const result = error.stack || error.message || String(error);
    const content = [{ json: { error: result } }];
    return { toolResult: { toolUseId, content } };
  }
}

// Search tool - calls /api/search
async function search({ query }) {
  const response = await fetch("/api/search?" + new URLSearchParams({ q: query }));
  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }
  const data = await response.json();
  const extract = (r) => ({
    url: r.url,
    title: r.title,
    description: r.description,
    extra_snippets: r.extra_snippets,
    age: r.age,
    page_age: r.page_age,
    article: r.article,
  });
  return {
    web: data.web?.web?.results?.map(extract),
    news: data.news?.results?.map(extract),
    gov: data.gov?.results,
  };
}

// Browse tool - calls /api/browse
async function browse({ url, topic }) {
  const urls = Array.isArray(url) ? url : [url];
  if (urls.length === 0) return "No URLs provided";

  const results = await Promise.all(
    urls.map(async (u) => {
      const response = await fetch("/api/browse/" + u);
      if (!response.ok) {
        return `Failed to read ${u}: ${response.status} ${response.statusText}`;
      }
      const bytes = await response.arrayBuffer();
      const mimetype = response.headers.get("content-type") || "text/html";
      const text = await parseDocument(bytes, mimetype, u);

      const finalResults = !topic
        ? text
        : await queryDocumentWithModel(`<url>${u}</url>\n<text>${text}</text>`, topic);
      return ["## " + u, finalResults].join("\n\n");
    })
  );
  return results.join("\n\n---\n\n");
}

// Parse document from various formats
async function parseDocument(bytes, mimetype, url) {
  if (mimetype.includes("text/html") || mimetype.includes("text/plain")) {
    const text = new TextDecoder("utf-8").decode(bytes);
    if (mimetype.includes("text/html")) {
      const doc = new DOMParser().parseFromString(text, "text/html");
      return doc.body?.innerText || text;
    }
    return text;
  }
  return `[Document from ${url} - ${mimetype}]`;
}

// Query document with model for topic extraction
async function queryDocumentWithModel(document, topic, model = "us.meta.llama4-maverick-17b-instruct-v1:0") {
  if (!topic) return document;

  const maxLength = 500000;
  if (document.length > maxLength) {
    document = document.slice(0, maxLength) + "\n ... (truncated)";
  }

  const system = `You are a research assistant. You will be given a document and a question.
Your task is to answer the question using only the information in the document and provide a fully-verifiable, academic report in markdown format.
If the document doesn't contain information relevant to the question, state this explicitly.`;

  const prompt = `Answer this question about the document: "${topic}"`;
  const messages = [{ role: "user", content: [{ text: prompt }] }];

  const response = await fetch("/api/model", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages, system }),
  });
  const results = await response.json();
  return results?.output?.message?.content?.[0]?.text || document;
}

// Code tool - sandboxed iframe execution
function code({ language = "javascript", source, timeout = 5000 }) {
  return new Promise((resolve) => {
    const logs = [];
    const frame = document.createElement("iframe");
    frame.sandbox = "allow-scripts allow-same-origin";
    frame.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:0;height:0;border:0";
    document.body.appendChild(frame);

    const onMsg = (e) => {
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
      const height = Math.max(
        b?.scrollHeight || 0,
        b?.offsetHeight || 0,
        de?.clientHeight || 0,
        de?.scrollHeight || 0,
        de?.offsetHeight || 0
      );
      const html = de?.outerHTML || "";
      frame.remove();
      resolve({ logs, height, html });
    };

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

// Editor tool - manages files in localStorage
function editor({ command, path, view_range, old_str, new_str, file_text, insert_line }) {
  if (!path) return "Error: File path is required";
  if (!command) return "Error: Command is required";

  const fileKey = `file:${path}`;
  const historyKey = `history:${path}`;

  const normalizeNewlines = (text) => {
    if (typeof text !== "string") return "";
    return text.replace(/\r\n/g, "\n");
  };

  try {
    switch (command) {
      case "view": {
        const content = localStorage.getItem(fileKey);
        if (content === null) {
          return `File not found: ${path}`;
        }
        const lines = normalizeNewlines(content).split("\n");
        const [start, end] = view_range || [1, lines.length];
        const startLine = Math.max(1, start);
        const endLine = end === -1 ? lines.length : Math.min(end, lines.length);
        return lines
          .slice(startLine - 1, endLine)
          .map((line, idx) => `${startLine + idx}: ${line}`)
          .join("\n");
      }

      case "create": {
        const fileContent = file_text !== undefined ? normalizeNewlines(file_text) : "";
        const overwritten = localStorage.getItem(fileKey) !== null;
        localStorage.setItem(fileKey, fileContent);
        return overwritten ? `Overwrote existing file: ${path}` : `Successfully created file: ${path}`;
      }

      case "str_replace": {
        if (old_str === undefined) return "Error: old_str parameter is required for str_replace";
        if (new_str === undefined) return "Error: new_str parameter is required for str_replace";

        const content = localStorage.getItem(fileKey);
        if (content === null) return `File not found: ${path}`;

        const normalizedContent = normalizeNewlines(content);
        const normalizedOldStr = normalizeNewlines(old_str);

        let count = 0;
        let position = 0;
        while (true) {
          position = normalizedContent.indexOf(normalizedOldStr, position);
          if (position === -1) break;
          count++;
          if (normalizedOldStr === "") break;
          position += normalizedOldStr.length;
        }

        if (count === 0) return "The specified text was not found in the file.";
        if (count > 1) return `Found ${count} occurrences of the text. The replacement must match exactly one location.`;

        localStorage.setItem(historyKey, content);
        const newContent = normalizedContent.replace(normalizedOldStr, normalizeNewlines(new_str));
        localStorage.setItem(fileKey, newContent);
        return "Successfully replaced text at exactly one location.";
      }

      case "insert": {
        if (new_str === undefined) return "Error: new_str parameter is required for insert";
        if (insert_line === undefined) return "Error: insert_line parameter is required for insert";

        const content = localStorage.getItem(fileKey);
        if (content === null) return `File not found: ${path}`;

        localStorage.setItem(historyKey, content);
        const lines = normalizeNewlines(content).split("\n");
        const insertLineIndex = Math.min(Math.max(0, insert_line), lines.length);
        const linesToInsert = normalizeNewlines(new_str).split("\n");
        lines.splice(insertLineIndex, 0, ...linesToInsert);
        localStorage.setItem(fileKey, lines.join("\n"));
        return `Successfully inserted text after line ${insertLineIndex}.`;
      }

      case "undo_edit": {
        const previousContent = localStorage.getItem(historyKey);
        if (previousContent === null) return `No previous edit found for file: ${path}`;

        localStorage.setItem(fileKey, previousContent);
        localStorage.removeItem(historyKey);
        return `Successfully reverted last edit for file: ${path}`;
      }

      default:
        return `Error: Unknown command: ${command}`;
    }
  } catch (error) {
    return `Error processing command ${command}: ${error.message}`;
  }
}

// Think tool - logs thoughts to _thoughts.txt file
function think({ thought }) {
  editor({
    command: "insert",
    path: "_thoughts.txt",
    insert_line: 0,
    new_str: thought,
  });
  return "Thinking complete.";
}

// Data tool - access S3 bucket files
async function data({ bucket, key }) {
  const params = new URLSearchParams({ bucket });
  if (key) params.set("key", key);

  const response = await fetch("/api/data?" + params);

  if (!response.ok) {
    throw new Error(`Failed to access data: ${response.status} ${response.statusText}`);
  }

  // If listing files (no key or directory)
  if (!key || key.endsWith("/")) {
    return await response.json();
  }

  // If fetching file content
  const text = await response.text();

  // Try to parse as JSON if applicable
  if (key.endsWith(".json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return text;
}

// DocxTemplate tool - fill DOCX documents with batch find-and-replace
async function docxTemplate({ docxUrl, replacements }) {
  // 1. Fetch the document
  let templateBuffer;

  if (docxUrl.startsWith("s3://")) {
    const s3Match = docxUrl.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!s3Match) throw new Error("Invalid S3 URL format. Expected: s3://bucket/key");
    const [, bucket, key] = s3Match;
    const response = await fetch(
      `/api/data?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}&raw=true`
    );
    if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
    templateBuffer = await response.arrayBuffer();
  } else {
    const response = await fetch("/api/browse/" + docxUrl);
    if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
    templateBuffer = await response.arrayBuffer();
  }

  // 2. Discovery mode: return document text content
  if (!replacements) {
    const result = await mammoth.extractRawText({ arrayBuffer: templateBuffer });
    return { text: result.value };
  }

  // 3. Replace mode: apply replacements and return HTML preview
  const modifiedBuffer = await docxReplace(templateBuffer, replacements);
  const result = await mammoth.convertToHtml({ arrayBuffer: modifiedBuffer });

  return {
    html: result.value,
    warnings: result.messages.filter((m) => m.type === "warning").map((m) => m.message),
  };
}

// =================================================================================
// UTILITIES
// =================================================================================

export function parseJSON(input) {
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
    throw new Error(`Unexpected token '${char}' at position ${index}`);
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
    index++;
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
      index++;
    }
    return obj;
  }

  function parseString() {
    if (jsonString[index] !== '"') {
      throw new Error("Expected '\"' to start a string");
    }
    const startIndex = index;
    index++;
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
