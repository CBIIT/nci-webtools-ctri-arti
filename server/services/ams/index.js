import { createAgent, getAgents, getAgent, updateAgent, deleteAgent } from "./agents.js";
import { getModels, getModel } from "./models.js";
import {
  getTools, createKnowledgeBase, getKnowledgeBases, getKnowledgeBase,
  updateKnowledgeBase, deleteKnowledgeBase, deleteKnowledgeBaseFile,
} from "./tools.js";
import {
  createConversation, getConversations, getConversation, chat, deleteConversation,
} from "./conversations.js";
import { uploadFile, getFiles, deleteFile } from "./files.js";
import { createUser, getUsers, getUser, updateUser, deleteUser } from "./users.js";
import { getUsages } from "./usages.js";

export const agentManagementService = {
  createAgent,
  getAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  getModels,
  getModel,
  getTools,
  createKnowledgeBase,
  getKnowledgeBases,
  getKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  deleteKnowledgeBaseFile,
  createConversation,
  getConversations,
  getConversation,
  chat,
  deleteConversation,
  uploadFile,
  getFiles,
  deleteFile,
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  getUsages,
};
