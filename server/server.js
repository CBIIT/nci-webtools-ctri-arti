import http from "http";
import https from "https";
import { pathToFileURL } from "url";

import express from "express";
import session from "express-session";
import logger from "shared/logger.js";
import { nocache } from "shared/middleware.js";

import api from "./services/api.js";
import { startScheduler } from "./services/scheduler.js";
import { createCertificate } from "./services/utils.js";

const { PORT = 8080, SESSION_MAX_AGE, PGHOST } = process.env;
const sessionMaxAge = parseInt(SESSION_MAX_AGE, 10) || 30 * 60 * 1000;

// Only start server if this file is run directly (not imported)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await createApp(process.env);
  const _scheduler = startScheduler();
  createServer(app, process.env).listen(PORT, () =>
    logger.info(`Server is running on port ${PORT}`)
  );
}

export async function createApp(env = process.env) {
  const { CLIENT_FOLDER = "../client", SESSION_SECRET } = env;
  const app = express();
  app.set("trust proxy", true);
  app.disable("x-powered-by");
  app.use(nocache);

  let store;
  if (!PGHOST) {
    // Use memory store for PGlite (local dev / tests)
    store = new session.MemoryStore();
  } else {
    const { createSessionStore } = await import("./services/session-store.js");
    store = createSessionStore(session);
  }

  app.use(
    session({
      cookie: { maxAge: sessionMaxAge },
      rolling: true,
      resave: false,
      saveUninitialized: false,
      secret: SESSION_SECRET,
      store,
    })
  );
  app.use("/api/v1", api);
  app.use("/api", api); // backward compat (deprecated)
  app.use(express.static(CLIENT_FOLDER));
  app.get(/.*/, (req, res) => res.sendFile("index.html", { root: CLIENT_FOLDER }));
  return app;
}

export function createServer(app, env = process.env) {
  const { PORT, HTTPS_KEY, HTTPS_CERT } = env;
  const useHttps = +PORT === 443 || HTTPS_KEY || HTTPS_CERT;
  const lib = useHttps ? https : http;
  const options = { requestTimeout: 0, key: HTTPS_KEY, cert: HTTPS_CERT };
  if (useHttps && !(options.key && options.cert)) {
    Object.assign(options, createCertificate());
  }
  return lib.createServer(options, app);
}
