import http from "http";
import https from "https";
import { pathToFileURL } from "url";

import { getSchemaReadiness, waitForSchemaReady } from "database/readiness.js";
import express from "express";
import session from "express-session";
import logger from "shared/logger.js";
import { nocache, securityHeaders } from "shared/middleware.js";

import { createServerApi } from "./api/index.js";
import { touchSession } from "./api/middleware.js";
import { createCertificate } from "./api/utils.js";
import { getServerModules } from "./compose.js";
import { startScheduler } from "./runtime/scheduler.js";

const { PORT = 8080, SESSION_MAX_AGE, PGHOST } = process.env;
const sessionMaxAge = parseInt(SESSION_MAX_AGE, 10) || 30 * 60 * 1000;

const entrypointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entrypointUrl && import.meta.url === entrypointUrl) {
  let schemaReady = false;
  const application = await createApp(process.env);
  const app = express();
  app.get("/health", async (_req, res) => {
    const readiness = await getSchemaReadiness();
    res.status(readiness.ready ? 200 : 503).json({
      status: readiness.ready ? "ok" : "waiting",
      schema: readiness,
    });
  });
  app.use(async (req, res, next) => {
    if (schemaReady) {
      return application(req, res, next);
    }

    const readiness = await getSchemaReadiness();
    return res.status(503).json({
      error: "Service is starting",
      schema: readiness,
    });
  });

  waitForSchemaReady()
    .then(() => {
      schemaReady = true;
      startScheduler();
    })
    .catch((error) => logger.error(`Server schema readiness failed: ${error.message || error}`));

  createServer(app, process.env).listen(PORT, () =>
    logger.info(`Server is running on port ${PORT}`)
  );
}

export async function createApp(env = process.env) {
  const { CLIENT_FOLDER = "../client", SESSION_SECRET } = env;
  const app = express();
  app.set("trust proxy", true);
  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(nocache);

  let store;
  if (!PGHOST) {
    store = new session.MemoryStore();
  } else {
    const { createSessionStore } = await import("./runtime/session-store.js");
    store = createSessionStore(session);
  }

  const modules = await getServerModules();
  const api = createServerApi({ modules });

  app.use(
    session({
      cookie: {
        maxAge: sessionMaxAge,
        secure: "auto",
      },
      rolling: false,
      proxy: true,
      resave: false,
      saveUninitialized: false,
      secret: SESSION_SECRET,
      store,
    })
  );
  app.use(touchSession({ except: (req) => req.method === "GET" && req.path.endsWith("/session") }));
  app.use("/api/v1", api);
  app.use("/api", api); // backward compat (deprecated)
  app.get("/health", async (_req, res) => {
    const readiness = await getSchemaReadiness();
    res.status(readiness.ready ? 200 : 503).json({
      status: readiness.ready ? "ok" : "waiting",
      schema: readiness,
    });
  });
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
