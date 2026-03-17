import http from "http";

import express from "express";
import logger from "shared/logger.js";

import { createUsersRouter } from "./http.js";
import { createUsersService } from "./service.js";

const { PORT = 3004 } = process.env;
const application = createUsersService();

const app = express();
app.disable("x-powered-by");
app.use("/api", createUsersRouter({ application }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

http.createServer(app).listen(PORT, () => logger.info(`Users service listening on port ${PORT}`));
