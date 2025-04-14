import http from "http";
import https from "https";
import path from "path";
import { existsSync, readFileSync } from "fs";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy } from "openid-client/passport";
import { discovery } from "openid-client";
import { createLogger } from "./services/logger.js";
import api from "./services/api.js";

const {
  PORT = 8080,
  CLIENT_FOLDER = "../client",
  HTTPS_PEM,
  SESSION_SECRET,
  OAUTH_DISCOVERY_URL,
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_CLIENT_SCOPES,
  OAUTH_CALLBACK_URL,
  LOG_LEVEL,
} = process.env;
const app = express();
app.locals.logger = createLogger("research-optimizer", LOG_LEVEL || "info");

const scope = OAUTH_CLIENT_SCOPES || "openid profile email";
const config = await discovery(new URL(OAUTH_DISCOVERY_URL), OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET);
const strategyOptions = { callbackURL: OAUTH_CALLBACK_URL, config, scope };
const verify = async (tokenset, done) => done(null, { email: (await tokenset.claims()).email });
passport.use("default", new Strategy(strategyOptions, verify));
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

const setHeaders = (res) => res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
app.use(express.static(CLIENT_FOLDER, { setHeaders }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true },
    proxy: true,
  })
);
app.use(passport.session());
app.use("/api", api);
app.get(/.*/, (req, res) => res.sendFile("index.html", { root: CLIENT_FOLDER }));
const lib = HTTPS_PEM ? https : http;
const readFile = (path) => (path && existsSync(path) ? readFileSync(path) : undefined);
const options = {
  requestTimeout: 0,
  key: readFile(HTTPS_PEM),
  cert: readFile(HTTPS_PEM),
};
lib.createServer(options, app).listen(PORT, () => app.locals.logger.info(`Server is running on port ${PORT}`));
