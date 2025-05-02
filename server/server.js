import http from "http";
import https from "https";
import { readFileSync } from "fs";
import express from "express";
import session from "express-session";
import SequelizeStore from "connect-session-sequelize";
import logger from "./services/logger.js";
import db from "./services/database.js";
import api from "./services/api.js";

const { PORT = 8080, SESSION_MAX_AGE = 60 * 60 * 1000 } = process.env;
const SessionStore = SequelizeStore(session.Store);

const app = createApp(process.env);
createServer(app, process.env).listen(PORT, () => logger.info(`Server is running on port ${PORT}`));

export function createApp(env = process.env) {
  const { CLIENT_FOLDER = "../client", SESSION_SECRET } = env;
  const app = express();
  const store = new SessionStore({ db });
  store.sync({ force: true });
  app.use(
    session({
      cookie: { maxAge: SESSION_MAX_AGE },
      resave: false,
      saveUninitialized: true,
      secret: SESSION_SECRET,
      store,
    })
  );
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
