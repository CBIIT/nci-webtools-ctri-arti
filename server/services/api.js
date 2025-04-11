import { Router, json } from "express";
import multer from "multer";
import passport from "passport";
import { runModel, processDocuments } from "./inference.js";
import { proxyMiddleware } from "./middleware.js";
import { search, renderHtml } from "./utils.js";
import { getSession, cleanupSessions, resetBrowser } from "./browser.js";
import { translate, getLanguages } from "./translate.js";
const { UPLOAD_FIELD_SIZE } = process.env;

const api = Router();
const fieldSize = UPLOAD_FIELD_SIZE || 1024 * 1024 * 1024; // 1gb
const upload = multer({ limits: { fieldSize } });
setInterval(cleanupSessions, 60 * 1000);

api.use(json({ limit: fieldSize }));

api.get("/login", (request, response, next) => {
  const options = { failureRedirect: request.baseUrl + request.path };
  const callback = () => response.redirect(request.query.destination || "/");
  passport.authenticate("default", options, callback)(request, response, next);
});

api.get("/logout", (request, response) => {
  request.logout(() => response.redirect("/"));
});

api.get("/session", (request, response) => {
  const { session } = request;
  if (session.passport?.user) {
    response.json({
      authenticated: true,
      expires: session.expires,
      user: request.user,
    });
  } else {
    response.json({ authenticated: false });
  }
});

api.post("/session", (request, response) => {
  const { session } = request;
  if (session.passport?.user) {
    session.touch();
    session.expires = session.cookie.expires;
    response.json({
      authenticated: true,
      expires: session.expires,
      user: request.user,
    });
  } else {
    response.json({ authenticated: false });
  }
});

api.get("/ping", (req, res) => {
  res.json(true);
});

api.all("/proxy/*url", proxyMiddleware);
api.all("/proxy", proxyMiddleware);

api.get("/search", async (req, res) => {
  res.json(await search(req.query));
});

api.all("/translate", async (req, res) => {
  const { text, sourceLanguage, targetLanguage, settings } = { ...req.query, ...req.body };
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }
  res.json(await translate(text, sourceLanguage, targetLanguage, settings));
});

api.all("/translate/languages", async (req, res) => {
  res.json(await getLanguages());
});

api.all("/browse", async (req, res) => {
  const { url, id } = { ...req.query, ...req.body };
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }
  const html = await renderHtml(url, id);
  return html ? res.end(html) : proxyMiddleware(req, res);
});

api.all("/browse/run", async (req, res) => {
  const { code, id } = { ...req.query, ...req.body };

  if (!code || !id) {
    return res.status(400).json({ error: "Code and id are required" });
  }

  const session = await getSession(id);
  const result = await session.page.evaluate(code);

  return res.json({ result });
});

// todo: implement authorization for this endpoint
api.get("/browse/cleanup", async (req, res) => {
  await resetBrowser();
  return res.json({ message: "Browser and sessions reset successfully" });
});

api.all("/model/run", async (req, res) => {
  const useQuery = req.method === "GET";
  const useBody = req.method === "POST";
  if (!useQuery && !useBody) {
    res.status(405).end();
    return;
  }
  let { model, messages, system, thoughtBudget, tools, stream } = useQuery ? req.query : req.body;
  if (useQuery) {
    messages = JSON.parse(messages || "[]");
    tools = JSON.parse(tools || "[]");
  }
  const results = await runModel(model, messages, system, thoughtBudget, tools, stream);
  if (stream) {
    for await (const message of results?.stream || []) {
      res.write(JSON.stringify(message) + "\n");
    }
    res.end();
  } else {
    res.json(results);
  }
});

api.post("/submit", upload.any(), async (req, res) => {
  const { model, prompt, ids } = req.body;
  const results = await processDocuments(model, prompt, req.files);
  const mappedResults = ids.split(",").map((id, index) => ({ id, ...results[index] }));
  res.json(mappedResults);
});

export default api;
