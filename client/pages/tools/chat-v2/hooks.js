import { createEffect } from "solid-js";
import { createStore, produce } from "solid-js/store";

import { getPdfPageCount, parseJSON } from "../../../utils/parsers.js";

// =================================================================================
// API HELPER
// =================================================================================

async function api(path, options = {}) {
  const res = await fetch(`/api/v1${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return options.raw ? res : res.json();
}

// =================================================================================
// CORE LOGIC & STATE - useAgent Hook
// =================================================================================

export function useAgent({ agentId, conversationId }) {
  agentId = +agentId || 1;
  conversationId = +conversationId || null;

  const [params, setParams] = createStore({ agentId, conversationId });
  const [agent, setAgent] = createStore({
    id: null,
    name: null,
    conversation: { id: null, name: null },
    modelId: null,
    modelOverride: null,
    reasoningMode: false,
    loading: false,
    summarizing: false,
    messages: [],
  });

  const [conversations, setConversations] = createStore([]);

  async function loadConversations() {
    try {
      const result = await api("/conversations");
      const list = (result.data || result)
        .map((c) => ({ ...c, name: c.title ?? c.name }))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 20);
      setConversations(list);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  }

  async function updateConversation(conversationId, updates) {
    try {
      const body = {};
      if (updates.name !== undefined) body.title = updates.name;
      await api(`/conversations/${conversationId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (conversationId === params.conversationId) {
        setAgent("conversation", "name", updates.name);
      }
      await loadConversations();
    } catch (error) {
      console.error("Failed to update conversation:", error);
    }
  }

  async function deleteConversation(conversationId) {
    try {
      await api(`/conversations/${conversationId}`, { method: "DELETE" });
      if (params.conversationId === conversationId) {
        setParams("conversationId", null);
        setAgent("messages", []);
        setAgent("conversation", { id: null, name: null });
      }
      await loadConversations();
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  }

  // Load history when conversationId changes
  createEffect(async () => {
    const requestedConversationId = params.conversationId;
    if (!requestedConversationId) return;
    const [messages, conv] = await Promise.all([
      api(`/conversations/${requestedConversationId}/messages`),
      api(`/conversations/${requestedConversationId}`),
    ]);
    if (params.conversationId !== requestedConversationId) return;
    if (!messages?.length) return;
    if (agent.loading && agent.conversation.id === requestedConversationId) return;
    if (
      agent.conversation.id === requestedConversationId &&
      agent.messages.length > messages.length
    ) {
      return;
    }
    setAgent({
      messages: messages.map(({ id, role, content }) => ({ id, role, content })),
      conversation: { id: requestedConversationId, name: conv.title ?? conv.name ?? "Untitled" },
    });
  });

  // Load conversations on mount
  createEffect(async () => {
    await loadConversations();
  });

  createEffect(async () => {
    const requestedAgentId = params.agentId;
    if (!requestedAgentId) return;

    try {
      const record = await api(`/agents/${requestedAgentId}`);
      if (params.agentId !== requestedAgentId) return;
      setAgent((current) => ({
        ...current,
        id: record.id,
        name: record.name,
        modelId: record.runtime?.model || null,
        modelOverride: null,
      }));
    } catch (error) {
      console.error("Failed to load agent:", error);
    }
  });

  async function sendMessage(text, files = [], modelId, reasoningMode) {
    setAgent("loading", true);

    try {
      let currentConversationId = params.conversationId;
      const shouldGenerateTitle = !currentConversationId && agent.conversation.name === null;
      if (!currentConversationId) {
        setAgent("conversation", "name", "Untitled");
        const conv = await api("/conversations", {
          method: "POST",
          body: JSON.stringify({ title: "Untitled", agentId }),
        });
        currentConversationId = conv.id;
        setParams("conversationId", currentConversationId);
        setAgent("conversation", "id", currentConversationId);
        await loadConversations();
      }

      const content = await getMessageContent(text, files);
      const userMessage = { role: "user", content };

      const record = await api(`/agents/${params.agentId}`);
      const modelOverride = modelId && modelId !== record.runtime?.model ? modelId : null;
      const effectiveModel = modelOverride || record.runtime?.model || null;

      setAgent({
        id: record.id,
        conversation: { id: currentConversationId, name: agent.conversation.name },
        modelId: effectiveModel,
        modelOverride,
        reasoningMode,
        name: record.name,
        messages: agent.messages.concat([userMessage]),
      });

      if (shouldGenerateTitle) {
        void generateTitle(text, currentConversationId);
      }

      await streamChat(agent, setAgent, params.agentId, currentConversationId);
    } finally {
      setAgent("loading", false);
    }
  }

  async function generateTitle(
    messageText,
    conversationId,
    modelId = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
  ) {
    if (!conversationId || agent.conversation.name !== "Untitled" || !messageText?.trim()) return;

    try {
      const response = await fetch("/api/v1/model/invoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: [{ text: messageText }] }],
          system:
            "Generate a concise chat title from the user's message only. " +
            "Respond with only a short title, maximum 30 characters, using only letters, numbers, and spaces.",
          thoughtBudget: 0,
          stream: false,
          type: "chat-title",
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
        await updateConversation(conversationId, { name: title });
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
    conversations,
    loadConversations,
    updateConversation,
    deleteConversation,
    generateTitle,
  };
}

// =================================================================================
// STREAMING
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
        } catch (_error) {
          console.warn("Failed to parse line:", line);
        }
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer);
    } catch (_error) {
      console.warn("Failed to parse remaining buffer:", buffer);
    }
  }
}

async function streamChat(store, setStore, agentId, conversationId) {
  const userMessage = store.messages.at(-1);
  const thoughtBudget = store.reasoningMode ? 32000 : 0;

  const response = await fetch(`/api/v1/agents/${agentId}/conversations/${conversationId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: userMessage,
      modelOverride: store.modelOverride || null,
      thoughtBudget,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Agent API error: ${response.status}`);
  }

  let assistantMessageIndex = null;
  let summaryMessageIndex = null;
  let toolResultsMessageIndex = null;
  let isSummarizing = false;
  const pendingClientTools = [];

  function appendMessage(role) {
    const index = store.messages.length;
    setStore("messages", index, { role, content: [] });
    return index;
  }

  function ensureToolResultsMessage() {
    toolResultsMessageIndex ??= appendMessage("user");
    return toolResultsMessageIndex;
  }

  function isContentStreamEvent(event) {
    return (
      event.messageStart ||
      event.contentBlockStart ||
      event.contentBlockDelta ||
      event.contentBlockStop
    );
  }

  for await (const event of streamResponse(response)) {
    if (event.agentError) throw new Error(event.agentError.message);

    if (event.summarizing !== undefined) {
      isSummarizing = event.summarizing;
      setStore("summarizing", isSummarizing);
      if (isSummarizing) {
        summaryMessageIndex = null;
        assistantMessageIndex = null;
      } else {
        summaryMessageIndex = null;
        assistantMessageIndex = null;
      }
      continue;
    }

    // During summarization, render content blocks as a user message
    if (isSummarizing) {
      if (isContentStreamEvent(event)) {
        summaryMessageIndex ??= appendMessage("user");
        setStore(produce((s) => processContentBlock(s, event, summaryMessageIndex)));
        continue;
      }
      if (event.messageStop) {
        summaryMessageIndex = null;
        assistantMessageIndex = null;
        continue;
      }
    }

    if (event.clientToolRequest) {
      pendingClientTools.push(event.clientToolRequest);
      continue;
    }

    if (event.toolResult) {
      const messageIndex = ensureToolResultsMessage();
      setStore(produce((s) => s.messages[messageIndex].content.push(event)));
      assistantMessageIndex = null;
      continue;
    }

    if (isContentStreamEvent(event)) {
      assistantMessageIndex ??= appendMessage("assistant");
      setStore(produce((s) => processContentBlock(s, event, assistantMessageIndex)));
    }

    if (event.messageStop) {
      assistantMessageIndex = null;
    }
  }

  // Execute client-only tools (e.g. code) that the server couldn't handle
  if (pendingClientTools.length > 0) {
    const content = await Promise.all(
      pendingClientTools.map(async ({ toolUseId, name, input }) => {
        try {
          const toolFn = { code }[name];
          const result = await toolFn?.(input, store, setStore);
          return { toolResult: { toolUseId, content: [{ json: { results: result } }] } };
        } catch (error) {
          return {
            toolResult: {
              toolUseId,
              content: [{ json: { error: error.stack || error.message || String(error) } }],
            },
          };
        }
      })
    );

    const messageIndex = ensureToolResultsMessage();
    setStore(produce((s) => s.messages[messageIndex].content.push(...content)));

    return await streamChat(store, setStore, agentId, conversationId);
  }
}

// =================================================================================
// CONTENT BLOCK PROCESSING
// =================================================================================

function processContentBlock(s, message, messageIndex = s.messages.length - 1) {
  const { contentBlockStart, contentBlockDelta, contentBlockStop } = message;
  const toolUse = contentBlockStart?.start?.toolUse;
  const messageContent = s.messages[messageIndex]?.content;
  if (!messageContent) return;

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
      block.toolUse ||= { input: {}, _rawInput: "" };
      block.toolUse._rawInput = (block.toolUse._rawInput || "") + toolUse.input;
      block.toolUse.input = parseJSON(block.toolUse._rawInput) || {};
    }
  } else if (contentBlockStop) {
    const { contentBlockIndex } = contentBlockStop;
    const block = messageContent[contentBlockIndex];
    if (block?.toolUse) {
      block.toolUse.input = parseJSON(block.toolUse._rawInput) || block.toolUse.input;
      delete block.toolUse._rawInput;
    }
    if (block?.text?.length === 0) {
      block.text += " ";
    }
  }
}

// =================================================================================
// FILE & MESSAGE HANDLING
// =================================================================================

const MAX_INLINE_SIZE = Math.floor(4.5 * 1024 * 1024);
const MAX_MODEL_FILES = 5;

async function getMessageContent(text, files) {
  const fileBlocks = [];
  const resourceOnlyBlocks = [];

  for (const file of files) {
    const block = await getContentBlock(file);
    if (!block) continue;

    if (file.size > MAX_INLINE_SIZE) {
      resourceOnlyBlocks.push(block);
    } else {
      fileBlocks.push(block);
    }
  }

  // All files go to the server for resource storage; split into inline vs resource-only
  const inlineBlocks = fileBlocks.slice(0, MAX_MODEL_FILES);
  const overflowBlocks = [...fileBlocks.slice(MAX_MODEL_FILES), ...resourceOnlyBlocks];

  // Tag overflow/resource-only blocks so server knows not to send them to the model
  for (const block of overflowBlocks) {
    (block.document || block.image).resourceOnly = true;
  }

  // Inform the model about files it won't see inline
  const overflowNames = overflowBlocks.map((b) => {
    const f = b.document || b.image;
    return f.originalName || f.name;
  });
  if (overflowNames.length > 0) {
    text += `\n\n${buildUploadedFilesNotice(overflowNames)}`;
  }

  return [...inlineBlocks, ...overflowBlocks, { text }];
}

function buildUploadedFilesNotice(names) {
  const files = names.join(", ");
  const examplePath = names[0];
  return [
    "<uploaded_files>",
    `These uploaded files were saved as conversation resources and are not attached inline: ${files}.`,
    `If the user asks about them, read them with the editor tool first using their filename, for example {"command":"view","path":"${examplePath}"}.`,
    "Do not say you have not read the file yet when it was just uploaded. Read it from resources with editor before answering.",
    "For the current turn's uploaded files, prefer editor over recall.",
    "</uploaded_files>",
  ].join("\n");
}

export async function getContentBlock(file) {
  const documentTypes = ["pdf", "csv", "doc", "docx", "xls", "xlsx", "html", "txt", "md"];
  const imageTypes = ["png", "jpg", "jpeg", "gif", "webp"];
  const isText =
    file.type.startsWith("text/") || file.type.includes("json") || file.type.includes("xml");
  const fileExtension = file.name.split(".").pop().toLowerCase();

  let format = fileExtension;
  if (isText && !documentTypes.includes(fileExtension)) format = "txt";
  if (fileExtension === "htm") format = "html";
  if (fileExtension === "jpeg") format = "jpg";

  const type = imageTypes.includes(format)
    ? "image"
    : documentTypes.includes(format)
      ? "document"
      : null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pageCount = format === "pdf" ? await getPdfPageCount(bytes.slice()) : undefined;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const base64 = btoa(binary);
  const sanitizeUploadName = (value) =>
    Array.from(String(value), (char) => {
      if (char === "_") return "-";
      if (/[A-Z0-9]/i.test(char) || /\s/.test(char) || "-()[]".includes(char)) return char;
      return " ";
    })
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  const originalName = (file.name || "").split(/[\\/]/).filter(Boolean).pop()?.trim() || "document";
  const stem = originalName.replace(/\.[^.]+$/, "");
  const name =
    sanitizeUploadName(type === "document" ? stem : originalName) ||
    (type === "document" ? "document" : "image");

  if (type) {
    return {
      [type]: { format, name, source: { bytes: base64 }, originalName, pageCount },
    };
  }
}

// =================================================================================
// CLIENT-SIDE TOOLS
// =================================================================================

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
        const _fetch = fetch;
        const _origin = "${location.origin}";
        window.fetch = async (url, opts = {}) => {
          try {
            const u = new URL(url);
            const isLocal = ["localhost","127.0.0.1","[::1]"].some(h => u.hostname === h || u.hostname.endsWith(".localhost"));
            if (isLocal) return _fetch(url, opts);
            return _fetch(_origin + "/api/v1/browse/" + u.href, opts);
          } catch (e) { return _fetch(url, opts); }
        };
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

// =================================================================================
// UTILITIES
// =================================================================================
