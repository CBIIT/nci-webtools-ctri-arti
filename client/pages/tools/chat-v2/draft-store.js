import { openDB } from "idb";

const DB_NAME = "chat-v2-drafts";
const STORE_NAME = "drafts";
export const EMPTY_CHAT_DRAFT = {
  message: "",
  modelId: null,
  files: [],
  reasoningMode: false,
};

let dbPromise;

function getDb() {
  dbPromise ||= openDB(DB_NAME, 1, {
    upgrade(db) {
      if (db.objectStoreNames.contains(STORE_NAME)) return;
      db.createObjectStore(STORE_NAME, { keyPath: "scope" });
    },
  });
  return dbPromise;
}

export function getChatDraftScope(agentId, userId, conversationId) {
  const normalizedAgentId = agentId === 0 || agentId ? String(agentId) : "";
  const normalizedConversationId =
    conversationId === "new" || conversationId === 0 || conversationId
      ? String(conversationId)
      : "";
  return normalizedAgentId && userId && normalizedConversationId
    ? `agent:${normalizedAgentId}:user:${userId}:conversation:${normalizedConversationId}`
    : null;
}

export async function loadChatDraft(scope) {
  if (!scope) return { ...EMPTY_CHAT_DRAFT };

  const db = await getDb();
  const draft = await db.get(STORE_NAME, scope);
  return {
    ...EMPTY_CHAT_DRAFT,
    ...(draft || {}),
    files: Array.isArray(draft?.files) ? draft.files : [],
    reasoningMode: Boolean(draft?.reasoningMode),
  };
}

export async function saveChatDraft(scope, draft) {
  if (!scope) return;

  const db = await getDb();
  await db.put(STORE_NAME, {
    scope,
    ...EMPTY_CHAT_DRAFT,
    ...(draft || {}),
    files: Array.from(draft?.files || []).filter(Boolean),
  });
}

export async function clearChatDraft(scope) {
  if (!scope) return;

  const db = await getDb();
  await db.delete(STORE_NAME, scope);
}
