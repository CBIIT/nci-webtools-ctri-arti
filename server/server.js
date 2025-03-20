import http from "http";
import https from "https";
import { existsSync, readFileSync } from "fs";
import express from "express";
import api from "./services/api.js";

const { PORT = 8080, CLIENT_FOLDER = "../client", HTTPS_PEM } = process.env;
const app = express();
const setHeaders = (res) => res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
app.use(express.static(CLIENT_FOLDER, { setHeaders }));
app.use("/api", api);

const lib = HTTPS_PEM ? https : http;
const readFile = (path) => (path && existsSync(path) ? readFileSync(path) : undefined);
const options = {
  requestTimeout: 0,
  key: readFile(HTTPS_PEM),
  cert: readFile(HTTPS_PEM),
};
lib.createServer(options, app).listen(PORT, () => console.log(`Server is running on port ${PORT}`));
