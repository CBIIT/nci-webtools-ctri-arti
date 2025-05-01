import http from "http";
import https from "https";
import { readFileSync } from "fs";
import express from "express";
import session from "express-session";
import { createLogger } from "./services/logger.js";
import api from "./services/api.js";

const { PORT = 8080 } = process.env;

const app = createApp(process.env);
createServer(app, process.env).listen(PORT, () => app.locals.logger.info(`Server is running on port ${PORT}`));

export function createApp(env = process.env) {
  const { CLIENT_FOLDER = "../client", SESSION_SECRET, LOG_LEVEL = "info" } = env;

  // create express app with logger, session, api
  const app = express();
  app.locals.logger = createLogger("research-optimizer", LOG_LEVEL);
  app.set("trust proxy", true);
  app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: true }));
  app.use("/api", api);

  // serve uncached static files, with 404 fallback for index.html
  const setHeaders = (res) => res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  app.use(express.static(CLIENT_FOLDER, { setHeaders }));
  app.get(/.*/, (req, res) => res.sendFile("index.html", { root: CLIENT_FOLDER }));

  return app;
}

export function createServer(app, env = process.env) {
  const { HTTPS_PEM } = env;
  const lib = HTTPS_PEM ? https : http;
  const cert = HTTPS_PEM ? readFileSync(HTTPS_PEM) : undefined;
  const options = { requestTimeout: 0, key: cert, cert };
  return lib.createServer(options, app);
}
