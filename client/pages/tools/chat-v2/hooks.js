import { createEffect } from "solid-js";
import { createStore, produce } from "solid-js/store";

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
    reasoningMode: false,
    loading: false,
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
    if (!params.conversationId) return;
    const [messages, conv] = await Promise.all([
      api(`/conversations/${params.conversationId}/messages`),
      api(`/conversations/${params.conversationId}`),
    ]);
    if (!messages?.length) return;
    setAgent({
      messages: messages.map(({ id, role, content }) => ({ id, role, content })),
      conversation: { id: params.conversationId, name: conv.title ?? conv.name ?? "Untitled" },
    });
  });

  // Load conversations on mount
  createEffect(async () => {
    await loadConversations();
  });

  async function sendMessage(text, files = [], modelId, reasoningMode) {
    setAgent("loading", true);

    try {
      if (!params.conversationId) {
        setAgent("conversation", "name", "Untitled");
        const conv = await api("/conversations", {
          method: "POST",
          body: JSON.stringify({ title: "Untitled", agentID: agentId }),
        });
        const id = conv.id;
        setParams("conversationId", id);
        setAgent("conversation", "id", id);
        await loadConversations();
      }

      const content = await getMessageContent(text, files);
      const userMessage = { role: "user", content };

      const record = await api(`/agents/${params.agentId}`);

      setAgent({
        id: record.id,
        conversation: { id: params.conversationId, name: agent.conversation.name },
        modelId,
        reasoningMode,
        name: record.name,
        messages: agent.messages.concat([userMessage]),
      });

      await streamChat(agent, setAgent, params.agentId, params.conversationId);
    } finally {
      setAgent("loading", false);
    }
  }

  async function generateTitle(modelId) {
    if (!params.conversationId || agent.conversation.name !== "Untitled") return;

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

      const response = await fetch("/api/v1/model", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: modelId || "us.anthropic.claude-haiku-4-5-20251001-v1:0",
          messages: [...agent.messages, titleInstruction],
          system: "Generate a concise title for this conversation.",
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
        await updateConversation(params.conversationId, { name: title });
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
        } catch (e) {
          console.warn("Failed to parse line:", line);
        }
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer);
    } catch (e) {
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
    body: JSON.stringify({ message: userMessage, model: store.modelId, thoughtBudget }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Agent API error: ${response.status}`);
  }

  let assistantStarted = false;
  const pendingClientTools = [];

  for await (const event of streamResponse(response)) {
    if (event.agentError) throw new Error(event.agentError.message);

    if (event.clientToolRequest) {
      pendingClientTools.push(event.clientToolRequest);
      continue;
    }

    if (event.toolResult) {
      if (!store.messages.at(-1)?.content?.some?.((c) => c.toolResult)) {
        setStore("messages", store.messages.length, { role: "user", content: [] });
      }
      setStore(produce((s) => s.messages.at(-1).content.push(event)));
      assistantStarted = false;
      continue;
    }

    if (
      event.contentBlockStart ||
      event.contentBlockDelta ||
      event.contentBlockStop ||
      event.messageStart
    ) {
      if (!assistantStarted && (event.contentBlockStart || event.messageStart)) {
        setStore("messages", store.messages.length, { role: "assistant", content: [] });
        assistantStarted = true;
      }
      setStore(produce((s) => processContentBlock(s, event)));
    }

    if (event.messageStop) {
      setStore(produce((s) => processContentBlock(s, event)));
      assistantStarted = false;
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

    if (store.messages.at(-1)?.role === "user") {
      setStore(produce((s) => s.messages.at(-1).content.push(...content)));
    } else {
      setStore("messages", store.messages.length, { role: "user", content });
    }

    return await streamChat(store, setStore, agentId, conversationId);
  }
}

// =================================================================================
// CONTENT BLOCK PROCESSING
// =================================================================================

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

const MAX_INLINE_SIZE = 5 * 1024 * 1024; // 5MB
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
    text += `\n\n<uploaded_files>${overflowNames.join(", ")}</uploaded_files>`;
  }

  return [...inlineBlocks, ...overflowBlocks, { text }];
}

async function getContentBlock(file) {
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
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const base64 = btoa(binary);
  const originalName = file.name;
  const name = originalName
    .replace(/[^A-Z0-9 _\-()[\]]/gi, "_")
    .replace(/\s+/g, " ")
    .trim();

  if (type) {
    return {
      [type]: { format, name, source: { bytes: base64 }, originalName },
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

function parseJSON(input) {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}
