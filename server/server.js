import http from "http";
import https from "https";
import express from "express";
import session from "express-session";
import SequelizeStore from "connect-session-sequelize";
import { createCertificate } from "./services/utils.js";
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
  app.set("trust proxy", true);
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
  const { PORT, HTTPS_KEY, HTTPS_CERT } = env;
  const useHttps = +PORT === 443 || HTTPS_KEY || HTTPS_CERT;
  const lib = useHttps ? https : http;
  const options = { requestTimeout: 0, key: HTTPS_KEY, cert: HTTPS_CERT };
  if (useHttps && !(options.key && options.cert)) {
    Object.assign(options, createCertificate());
  }
  return lib.createServer(options, app);
}
