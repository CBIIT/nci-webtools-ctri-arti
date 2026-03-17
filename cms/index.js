import http from "http";

import express from "express";
import { createGatewayRemote } from "gateway/remote.js";
import { createGatewayService } from "gateway/service.js";
import logger from "shared/logger.js";

import { createCmsRouter } from "./http.js";
import { createCmsService } from "./service.js";

const { PORT = 3002, GATEWAY_URL } = process.env;
const gateway = GATEWAY_URL
  ? createGatewayRemote({ baseUrl: GATEWAY_URL })
  : createGatewayService();
const application = createCmsService({ gateway, source: "internal-http" });

const app = express();
app.disable("x-powered-by");
app.use("/api/v1", createCmsRouter({ application }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

http.createServer(app).listen(PORT, () => logger.info(`CMS listening on port ${PORT}`));
