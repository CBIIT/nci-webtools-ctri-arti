import http from "http";
import express from "express";
import logger from "./services/logger.js";
import cmsApi from "./services/cms/api.js";

const { PORT = 3002 } = process.env;

const app = express();
app.disable("x-powered-by");
app.use("/api", cmsApi);
app.get("/health", (req, res) => res.json({ status: "ok" }));

http.createServer(app).listen(PORT, () =>
  logger.info(`CMS listening on port ${PORT}`)
);
