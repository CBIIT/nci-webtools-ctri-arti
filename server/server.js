import http from "http";
import https from "https";
import { existsSync, readFileSync } from "fs";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy } from "openid-client/passport";
import { discovery, fetchUserInfo } from "openid-client";
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
} = process.env;
const app = express();

const scope = OAUTH_CLIENT_SCOPES || "openid profile email";
const config = await discovery(new URL(OAUTH_DISCOVERY_URL), OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET);
const strategyOptions = { callbackURL: OAUTH_CALLBACK_URL, config, scope };
const verify = async (tokenset, done) => done(null, await tokenset.claims());
passport.use("default", new Strategy(strategyOptions, verify));
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

const setHeaders = (res) => res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
app.use(express.static(CLIENT_FOLDER, { setHeaders }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
    cookie: { secure: true },
    proxy: true,
  })
);
app.use(passport.session());
app.use("/api", api);
const lib = HTTPS_PEM ? https : http;
const readFile = (path) => (path && existsSync(path) ? readFileSync(path) : undefined);
const options = {
  requestTimeout: 0,
  key: readFile(HTTPS_PEM),
  cert: readFile(HTTPS_PEM),
};
lib.createServer(options, app).listen(PORT, () => console.log(`Server is running on port ${PORT}`));
