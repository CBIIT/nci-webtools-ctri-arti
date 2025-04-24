import { Router, json } from "express";
import multer from "multer";
import passport from "passport";
import { runModel, processDocuments } from "./inference.js";
import { authMiddleware, browserMiddleware, proxyMiddleware, logRequests, logErrors } from "./middleware.js";
import { search, renderHtml } from "./utils.js";
import { translate, getLanguages } from "./translate.js";
import { query } from "./database.js";
import { sendEmail } from "./email.js";
const { UPLOAD_FIELD_SIZE, VERSION, OAUTH_CALLBACK_URL } = process.env;

const api = Router();

// Specify maximum upload size
const fieldSize = UPLOAD_FIELD_SIZE || 1024 * 1024 * 1024; // 1gb
const upload = multer({ limits: { fieldSize } });
api.use(json({ limit: fieldSize }));

api.use(logRequests());

// Health check endpoint
api.get("/status", async (req, res) => {
  res.json({
    version: VERSION,
    database: await query("SELECT 'ok' AS health").then(r => r[0]),
  });
});

api.get("/login", passport.authenticate("default", { failureRedirect: "/", successRedirect: "/", prompt: "login" }));

api.get("/logout", (req, res) => {
  req.logout(() => res.redirect("/"));
});

api.get("/session", (req, res) => {
  res.json({
    authenticated: Boolean(req.user),
    expires: req.session?.expires,
    user: req.user,
  });
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

api.post("/feedback", authMiddleware, async (req, res) => {
  const { feedback, context } = req.body;
  const { EMAIL_RECIPIENT } = process.env;
  await sendEmail({
    from: req.user?.email || "noreply@nih.gov",
    to: EMAIL_RECIPIENT,
    subject: "Feedback from Research Optimizer",
    text: feedback,
    attachments: [
      {
        filename: "context.json",
        content: JSON.stringify(context, null, 2),
      }
    ],
  });
});

// Browsing endpoint
api.all("/browse", authMiddleware, browserMiddleware, async (req, res) => {
  const { browser } = req.app.locals;
  const { url } = { ...req.query, ...req.body };
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }
  const page = await browser.newPage();
  const html = await renderHtml(url, page, 10000);
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
