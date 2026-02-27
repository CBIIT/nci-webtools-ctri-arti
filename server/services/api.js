import { json, Router } from "express";
import { logRequests } from "shared/middleware.js";

import { logErrors } from "./middleware.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import conversationRoutes from "./routes/conversations.js";
import modelRoutes from "./routes/model.js";
import toolRoutes from "./routes/tools.js";

const api = Router();

api.use(json({ limit: 1024 ** 3 })); // 1GB
api.use(logRequests());
api.use(adminRoutes);
api.use(authRoutes);
api.use(conversationRoutes);
api.use(modelRoutes);
api.use(toolRoutes);
api.use(logErrors());

export default api;
