import http from "http";

import { createCmsRemote } from "cms/remote.js";
import { createCmsService } from "cms/service.js";
import express from "express";
import { createGatewayRemote } from "gateway/remote.js";
import { createGatewayService } from "gateway/service.js";
import logger from "shared/logger.js";

import { createAgentsRouter } from "./http.js";
import { createAgentsService } from "./service.js";

const { PORT = 3003, GATEWAY_URL, CMS_URL } = process.env;
const gateway = GATEWAY_URL
  ? createGatewayRemote({ baseUrl: GATEWAY_URL })
  : createGatewayService();
const cms = CMS_URL
  ? createCmsRemote({ baseUrl: CMS_URL })
  : createCmsService({ gateway, source: "direct" });
const application = createAgentsService({ gateway, cms, source: "internal-http" });

const app = express();
app.disable("x-powered-by");
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use(createAgentsRouter({ application }));

http.createServer(app).listen(PORT, () => logger.info(`Agents service listening on port ${PORT}`));
