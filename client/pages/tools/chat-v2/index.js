// =================================================================================
// 1. IMPORTS & SETUP
// =================================================================================

import { openDB } from "idb";
import { For, createEffect, createResource, Suspense, Show } from "solid-js";
import { createStore, produce, unwrap } from "solid-js/store";
import html from "solid-js/html";
import { Pencil, Trash2, Paperclip, Lightbulb } from "lucide-solid";

import { tools as toolSpecs, systemPrompt } from "../chat/config.js";

// Lazy DB initialization (singleton pattern for router compatibility)
let dbPromise = null;
async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB("chat-v2-messages", 1, {
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

    // Create default agent if none exists
    const db = await dbPromise;
    if (!(await db.count("agents"))) {
      await db.add("agents", {
        name: "Ada",
        tools: ["search", "browse", "code", "editor", "think"],
        resources: [],
      });
    }
  }
  return dbPromise;
}

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

// =================================================================================
// 2. TOOL DEFINITIONS
// =================================================================================

const TOOLS = [
  {
    fn: search,
    toolSpec: toolSpecs.find(t => t.toolSpec.name === "search")?.toolSpec,
  },
  {
    fn: browse,
    toolSpec: toolSpecs.find(t => t.toolSpec.name === "browse")?.toolSpec,
  },
  {
    fn: code,
    toolSpec: toolSpecs.find(t => t.toolSpec.name === "code")?.toolSpec,
  },
  {
    fn: editor,
    toolSpec: toolSpecs.find(t => t.toolSpec.name === "editor")?.toolSpec,
  },
  {
    fn: think,
    toolSpec: toolSpecs.find(t => t.toolSpec.name === "think")?.toolSpec,
  },
].filter(t => t.toolSpec);

// =================================================================================
// 3. UI COMPONENTS
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
      return html`
        <div class="small rounded p-2 mb-3 text-dark bg-secondary-subtle d-inline-block text-pre">${() => props.content.text}</div>
      `;
    } else if (props.role === "assistant") {
      return html`
        <div class="small p-2 mb-3 text-pre">${() => props.content.text}</div>
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

// =================================================================================
// EXPORTED PAGE COMPONENT (for router)
// =================================================================================

export default function Page() {
  const [db] = createResource(getDB);

  return html`
    <${Suspense} fallback=${html`<div class="container my-5"><p>Loading...</p></div>`}>
      <${Show} when=${db}>
        <${ChatApp} db=${db} />
      <//>
    <//>
  `;
}

// =================================================================================
// INTERNAL CHAT APPLICATION
// =================================================================================


function ChatApp(props) {
  const searchParams = new URLSearchParams(window.location.search);
  const urlParams = Object.fromEntries(searchParams.entries());
  const { agent, sendMessage, params } = useAgent(urlParams, props.db);

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
        ${message => html`
          <${For} each=${() => message.content}>
            ${content => html`
              <${MessageContent}
                role=${message.role}
                content=${content}
                messages=${() => agent.messages} />
            `}
          <//>
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
              accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.tsv,.md,.json,text/*"
              multiple />

            <label
              for="userFiles"
              class="btn btn-sm btn-secondary">
              <span class="visually-hidden">Attach Files</span>
              <${Paperclip} size="14" /> 
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
                <${Lightbulb} size="14" />
              </label>
            </div>
          </div>

          <div class="d-flex align-items-center gap-2">
            <select
              id="modelId"
              class="form-select form-select-sm w-auto border-transparent shadow-none"
              required>
              <option value="global.anthropic.claude-opus-4-5-20251101-v1:0">Opus</option>
              <option value="us.anthropic.claude-sonnet-4-5-20250929-v1:0" selected>Sonnet</option>
              <option value="us.anthropic.claude-haiku-4-5-20251001-v1:0">Haiku</option>
            </select>
            <button
              type="submit"
              class="btn btn-sm btn-dark"
              disabled=${() => agent.loading}>
              ${() => agent.loading ? "..." : "Send"}
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
    loading: false,
    tools: [],
    messages: [],
  });

  // Load history from IndexedDB
  createEffect(async () => {
    if (!params.threadId) return;
    const history = await db.getAllFromIndex("messages", "threadId", params.threadId);
    if (!history?.length) return;
    const thread = await db.get("threads", params.threadId);
    const name = thread?.name || "Untitled";
    const messages = history.map(({ role, content }) => ({ role, content }));
    setAgent({ messages, thread: { name } });
  });

  // Save changes when store updates
  createEffect(async () => {
    if (!params.agentId || !agent.id) return;
    await upsert(db, "agents", {
      id: params.agentId,
      name: agent.name,
      tools: agent.tools.map(t => t.toolSpec.name),
    });
    if (!params.threadId || !agent.thread.id) return;
    await upsert(db, "threads", {
      id: params.threadId,
      agentId: params.agentId,
      name: agent.thread.name,
    });
  });

  async function sendMessage(text, files = [], modelId, reasoningMode) {
    setAgent("loading", true);

    if (!params.threadId) {
      setAgent("thread", "name", "Untitled");
      const thread = { agentId, name: agent.thread.name };
      const threadId = await db.add("threads", thread);
      setParams("threadId", threadId);
    }

    const record = await db.get("agents", +params.agentId);
    const agentTools = tools.filter(t => record.tools.includes(t.toolSpec.name));

    const content = await getMessageContent(text, files);
    const userMessage = { role: "user", content };

    setAgent({
      id: record.id,
      thread: { id: params.threadId },
      modelId,
      reasoningMode,
      name: record.name,
      tools: agentTools,
      messages: agent.messages.concat([userMessage]),
    });

    const messages = await runAgent(agent, setAgent);
    for (const message of messages) {
      const messageRecord = unwrap(message);
      messageRecord.agentId = params.agentId;
      messageRecord.threadId = params.threadId;
      await db.add("messages", messageRecord);
    }
    setAgent("loading", false);
  }

  return { agent, params, setAgent, sendMessage };
}

// =================================================================================
// 5. API STREAMING & AGENT LOOP
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
  // Get memory/workspace content from localStorage (like original chat)
  const getFileContents = (file) => localStorage.getItem("file:" + file) || "";
  const memoryFiles = ["_profile.txt", "_memory.txt", "_insights.txt", "_workspace.txt", "_knowledge.txt", "_patterns.txt"];
  const memoryContent = memoryFiles
    .map(file => ({ file, contents: getFileContents(file) }))
    .filter(f => f.contents)
    .map(f => `<file name="${f.file}">${f.contents}</file>`)
    .join("\n");

  const system = systemPrompt({
    time: new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    main: memoryContent,
  });

  const tools = config.tools.map(({ toolSpec }) => ({ toolSpec })).filter(Boolean);
  const thoughtBudget = config.reasoningMode ? 32000 : 0;

  // Convert messages to API format - encode bytes as base64
  const messages = config.messages.map(msg => ({
    role: msg.role,
    content: msg.content.map(c => {
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
      console.log(message);
      setStore(produce(s => processContentBlock(s, message)));

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
// 6. FILE & MESSAGE HANDLING
// =================================================================================

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

// =================================================================================
// 7. TOOL EXECUTION
// =================================================================================

async function getToolResults(toolUseContent, tools, store, setStore) {
  const toolUses = toolUseContent.map(c => c.toolUse).filter(Boolean);
  const content = await Promise.all(toolUses.map(t => getToolResult(t, tools, store, setStore)));
  return { role: "user", content };
}

async function getToolResult(toolUse, tools, store, setStore) {
  let { toolUseId, name, input } = toolUse;
  try {
    const result = await tools?.[name]?.(input, store, setStore);
    const content = [{ json: { result } }];
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
  // Extract relevant fields from search results
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

      // If topic provided, query document with model
      const finalResults = !topic ? text : await queryDocumentWithModel(
        `<url>${u}</url>\n<text>${text}</text>`,
        topic
      );
      return ["## " + u, finalResults].join("\n\n");
    })
  );
  return results.join("\n\n---\n\n");
}

// Parse document from various formats
async function parseDocument(bytes, mimetype, url) {
  // For simple implementation, convert to text
  // More complex parsing would use the full parseDocument utility
  if (mimetype.includes("text/html") || mimetype.includes("text/plain")) {
    const text = new TextDecoder("utf-8").decode(bytes);
    if (mimetype.includes("text/html")) {
      // Strip HTML tags for simple text extraction
      const doc = new DOMParser().parseFromString(text, "text/html");
      return doc.body?.innerText || text;
    }
    return text;
  }
  // For other formats, return a notice
  return `[Document from ${url} - ${mimetype}]`;
}

// Query document with model for topic extraction
async function queryDocumentWithModel(document, topic, model = "us.meta.llama4-maverick-17b-instruct-v1:0") {
  if (!topic) return document;

  // Truncate very long documents
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
  return new Promise(resolve => {
    const logs = [];
    const frame = document.createElement("iframe");
    frame.sandbox = "allow-scripts allow-same-origin";
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

// Editor tool - manages files in localStorage (like the original implementation)
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

// =================================================================================
// 8. UTILITIES
// =================================================================================

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

// =================================================================================
// 9. END OF MODULE
// =================================================================================
