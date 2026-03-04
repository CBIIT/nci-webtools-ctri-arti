import { json, Router } from "express";
import multer from "multer";
import { logErrors, logRequests } from "../middleware.js";
import { agentManagementService as service } from "./index.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 }));
api.use(logRequests());
const upload = multer({ storage: multer.memoryStorage() });

// Extract userId from header (internal service communication)
api.use((req, res, next) => {
  req.userId = req.headers["x-user-id"];
  if (!req.userId) {
    return res.status(400).json({ error: "X-User-Id header required" });
  }
  next();
});

function handle(fn, status = 200) {
  return async (req, res, next) => {
    try {
      res.status(status).json(await fn(req));
    } catch (error) { next(error); }
  };
}

// ===== Agent routes =====
api.post("/v1/agents", handle((req) => service.createAgent(req.userId, req.body), 201));
api.get("/v1/agents", handle((req) => service.getAgents(req.userId)));
api.get("/v1/agents/:id", handle((req) => service.getAgent(req.userId, req.params.id)));
api.put("/v1/agents/:id", handle((req) => service.updateAgent(req.userId, req.params.id, req.body)));
api.delete("/v1/agents/:id", handle((req) => service.deleteAgent(req.userId, req.params.id)));

// ===== Model routes =====
api.get("/v1/models", handle((req) => service.getModels(req.userId)));
api.get("/v1/models/:id", handle((req) => service.getModel(req.userId, req.params.id, req.query)));

// ===== Tool routes =====
api.get("/v1/tools", handle((req) => service.getTools(req.userId)));

// ===== KnowledgeBase routes =====
api.post("/v1/tools/knowledgebase", handle((req) => service.createKnowledgeBase(req.userId, req.body), 201));
api.get("/v1/tools/knowledgebase", handle((req) => service.getKnowledgeBases(req.userId)));
api.get("/v1/tools/knowledgebase/:id", handle((req) => service.getKnowledgeBase(req.userId, req.params.id)));
api.put("/v1/tools/knowledgebase/:id", handle((req) => service.updateKnowledgeBase(req.userId, req.params.id, req.body)));
api.delete("/v1/tools/knowledgebase/:id", handle((req) => service.deleteKnowledgeBase(req.userId, req.params.id)));
api.delete("/v1/tools/knowledgebase/:id/file", handle((req) => service.deleteKnowledgeBaseFile(req.userId, req.params.id, req.body.files)));

// ===== Conversation routes =====
api.post("/v1/conversations", handle((req) => service.createConversation(req.userId, req.body), 201));
api.get("/v1/conversations", handle((req) => service.getConversations(req.userId)));
api.get("/v1/conversations/:id", handle((req) => service.getConversation(req.userId, req.params.id)));
api.put("/v1/conversations/:id", handle((req) => service.chat(req.userId, req.params.id, req.body)));
api.delete("/v1/conversations/:id", handle((req) => service.deleteConversation(req.userId, req.params.id)));

// ===== User routes =====
api.post("/v1/users", handle((req) => service.createUser(req.userId, req.body), 201));
api.get("/v1/users", handle((req) => service.getUsers(req.userId, req.query)));
api.get("/v1/users/:id", handle((req) => service.getUser(req.userId, req.params.id)));
api.put("/v1/users/:id", handle((req) => service.updateUser(req.userId, req.params.id, req.body)));
api.delete("/v1/users/:id", handle((req) => service.deleteUser(req.userId, req.params.id)));

// ===== Usage routes =====
api.get("/v1/usages", handle((req) => service.getUsages(req.userId, req.query)));

// ===== File routes =====
api.post("/v1/files", upload.single("content"), handle((req) => service.uploadFile(req.userId, req.file, req.body.filename), 201));
api.get("/v1/files", handle((req) => service.getFiles(req.userId)));
api.delete("/v1/files", handle((req) => service.deleteFile(req.userId, req.body.filename)));

api.use(logErrors());

export default api;
