import { getCmsModule } from "./compose.js";

async function callCms(method, ...args) {
  return (await getCmsModule())[method](...args);
}

export { getCmsModule };

export const createAgent = (...args) => callCms("createAgent", ...args);
export const getAgents = (...args) => callCms("getAgents", ...args);
export const getAgent = (...args) => callCms("getAgent", ...args);
export const updateAgent = (...args) => callCms("updateAgent", ...args);
export const deleteAgent = (...args) => callCms("deleteAgent", ...args);
export const createConversation = (...args) => callCms("createConversation", ...args);
export const getConversations = (...args) => callCms("getConversations", ...args);
export const getConversation = (...args) => callCms("getConversation", ...args);
export const updateConversation = (...args) => callCms("updateConversation", ...args);
export const deleteConversation = (...args) => callCms("deleteConversation", ...args);
export const getContext = (...args) => callCms("getContext", ...args);
export const appendConversationMessage = (...args) => callCms("appendConversationMessage", ...args);
export const getMessages = (...args) => callCms("getMessages", ...args);
export const updateMessage = (...args) => callCms("updateMessage", ...args);
export const deleteMessage = (...args) => callCms("deleteMessage", ...args);
export const storeConversationResource = (...args) => callCms("storeConversationResource", ...args);
export const getResource = (...args) => callCms("getResource", ...args);
export const updateConversationResource = (...args) =>
  callCms("updateConversationResource", ...args);
export const getResourcesByAgent = (...args) => callCms("getResourcesByAgent", ...args);
export const getResourcesByConversation = (...args) =>
  callCms("getResourcesByConversation", ...args);
export const deleteConversationResource = (...args) =>
  callCms("deleteConversationResource", ...args);
export const storeConversationVectors = (...args) => callCms("storeConversationVectors", ...args);
export const getVectorsByConversation = (...args) => callCms("getVectorsByConversation", ...args);
