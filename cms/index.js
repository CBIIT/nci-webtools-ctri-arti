import http from "http";
import express from "express";
import logger from "shared/logger.js";
import { v1Router } from "./api.js";

const { PORT = 3002 } = process.env;

const app = express();
app.disable("x-powered-by");
app.use("/api/v1", v1Router);
app.get("/health", (req, res) => res.json({ status: "ok" }));

http.createServer(app).listen(PORT, () =>
  logger.info(`CMS listening on port ${PORT}`)
);
