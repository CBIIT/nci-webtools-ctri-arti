import http from "http";
import express from "express";
import logger from "shared/logger.js";

const { PORT = 3004 } = process.env;

const app = express();
app.disable("x-powered-by");
app.get("/health", (req, res) => res.json({ status: "ok" }));

http.createServer(app).listen(PORT, () =>
  logger.info(`Users service listening on port ${PORT}`)
);
