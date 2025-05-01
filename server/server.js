import http from "http";
import https from "https";
import { readFileSync } from "fs";
import express from "express";
import session from "express-session";
import { createLogger } from "./services/logger.js";
import api from "./services/api.js";

const { PORT = 8080, CLIENT_FOLDER = "../client", HTTPS_PEM, SESSION_SECRET, LOG_LEVEL = "info" } = process.env;

const app = express();
app.set("trust proxy", true);
app.locals.logger = createLogger("research-optimizer", LOG_LEVEL);

// set up session
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    // cookie: { secure: true },
    proxy: true,
  })
);
// import api
app.use("/api", api);

// static files
const setHeaders = (res) => res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
app.use(express.static(CLIENT_FOLDER, { setHeaders }));
app.get(/.*/, (req, res) => res.sendFile("index.html", { root: CLIENT_FOLDER }));

// http/https server
const lib = HTTPS_PEM ? https : http;
const cert = HTTPS_PEM ? readFileSync(HTTPS_PEM) : undefined;
const options = { requestTimeout: 0, key: cert, cert };
lib.createServer(options, app).listen(PORT, () => app.locals.logger.info(`Server is running on port ${PORT}`));
