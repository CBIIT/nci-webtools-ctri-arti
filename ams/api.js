import { json, Router } from "express";
import { logErrors, logRequests } from "shared/middleware.js";

import agents from "./agents.js";
import conversations from "./conversations.js";
import files from "./files.js";
import models from "./models.js";
import tools from "./tools.js";
import usages from "./usages.js";

function userIdMiddleware(req, res, next) {
  req.userId = req.headers["x-user-id"];
  if (!req.userId) {
    return res.status(400).json({ error: "X-User-Id header required" });
  }
  next();
}

const v1 = Router();
v1.use(json({ limit: 1024 ** 3 }));
v1.use(logRequests());
v1.use(userIdMiddleware);

v1.use("/files", files);
v1.use("/tools", tools);
v1.use("/agents", agents);
v1.use("/models", models);
v1.use("/conversations", conversations);
v1.use("/usages", usages);

v1.use(logErrors());

export { v1 as v1Router };
export default v1;
