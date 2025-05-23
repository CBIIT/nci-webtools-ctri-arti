import { Router, json } from "express";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import modelRoutes from "./routes/model.js";
import toolRoutes from "./routes/tools.js";
import { logRequests, logErrors } from "./middleware.js";

const api = Router();

api.use(json({ limit: 1024 ** 3 })); // 1GB
api.use(logRequests());
api.use(adminRoutes);
api.use(authRoutes);
api.use(modelRoutes);
api.use(toolRoutes);
api.use(logErrors());

export default api;
