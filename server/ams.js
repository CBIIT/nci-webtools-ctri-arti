import http from "http";
import express from "express";
import logger from "./services/logger.js";
import amsApi from "./services/ams/api.js";

const { AMS_PORT = 3003 } = process.env;

const app = express();
app.disable("x-powered-by");
app.use("/api", amsApi);
app.get("/health", (req, res) => res.json({ status: "ok" }));

http.createServer(app).listen(AMS_PORT, () =>
  logger.info(`AMS listening on port ${AMS_PORT}`)
);
