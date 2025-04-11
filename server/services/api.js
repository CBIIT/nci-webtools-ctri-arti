import { Router, json } from "express";
import multer from "multer";
import passport from "passport";
import { runModel, processDocuments } from "./inference.js";
import { authMiddleware, browserMiddleware, proxyMiddleware, logRequests, logErrors } from "./middleware.js";
import { search, renderHtml } from "./utils.js";
import { translate, getLanguages } from "./translate.js";
const { UPLOAD_FIELD_SIZE } = process.env;

const api = Router();

// Specify maximum upload size
const fieldSize = UPLOAD_FIELD_SIZE || 1024 * 1024 * 1024; // 1gb
const upload = multer({ limits: { fieldSize } });
api.use(json({ limit: fieldSize }));

api.use(logRequests());

// Health check endpoint
api.get("/ping", (req, res) => {
  res.json(true);
});

// Authentication (log in, then redirect)
api.get("/login", (req, res, next) => {
  const failureRedirect = req.baseUrl + req.path;
  const successRedirect = req.query.destination || "/";
  const options = { failureRedirect, successRedirect };
  const callback = (err, user) => {
    (err && next(err)) || req.login(user, () => res.redirect(successRedirect));
  };
  passport.authenticate("default", options, callback)(req, res, next);
});

api.get("/logout", (req, res) => {
  req.logout(() => res.redirect("/"));
});

api.get("/session", (req, res) => {
  const { session } = req;
  if (session.passport?.user) {
    res.json({
      authenticated: true,
      expires: session.expires,
      user: req.user,
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Proxy endpoint
api.all("/proxy/*url", authMiddleware, proxyMiddleware);
api.all("/proxy", authMiddleware, proxyMiddleware);

// Search endpoint
api.get("/search", authMiddleware, async (req, res) => {
  res.json(await search(req.query));
});

// Translate endpoints
api.all("/translate", authMiddleware, async (req, res) => {
  const { text, sourceLanguage, targetLanguage, settings } = { ...req.query, ...req.body };
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }
  res.json(await translate(text, sourceLanguage, targetLanguage, settings));
});

api.all("/translate/languages", authMiddleware, async (req, res) => {
  res.json(await getLanguages());
});

// Browsing endpoint
api.all("/browse", authMiddleware, browserMiddleware, async (req, res) => {
  const { browser } = req.app.locals;
  const { url } = { ...req.query, ...req.body };
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }
  const page = await browser.newPage();
  const html = await renderHtml(url, page, 1000);
  await page.close();

  return html ? res.end(html) : proxyMiddleware(req, res);
});

// Model inference endpoint
api.all("/model/run", authMiddleware, async (req, res) => {
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

// Deprecated: Model inference endpoint
api.post("/submit", authMiddleware, upload.any(), async (req, res) => {
  const { model, prompt, ids } = req.body;
  const results = await processDocuments(model, prompt, req.files);
  const mappedResults = ids.split(",").map((id, index) => ({ id, ...results[index] }));
  res.json(mappedResults);
});

api.use(logErrors());

export default api;
