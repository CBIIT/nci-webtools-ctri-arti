import { Router, json } from "express";
import multer from "multer";
import * as client from "openid-client";
import { runModel, processDocuments } from "./inference.js";
import { authMiddleware, browserMiddleware, proxyMiddleware, logRequests, logErrors } from "./middleware.js";
import { search, renderHtml } from "./utils.js";
import { translate, getLanguages } from "./translate.js";
import { query } from "./database.js";
import { sendEmail } from "./email.js";

const { UPLOAD_FIELD_SIZE, VERSION, OAUTH_CALLBACK_URL, OAUTH_DISCOVERY_URL, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET } = process.env;

const api = Router();

const oidcConfig = await client.discovery(new URL(OAUTH_DISCOVERY_URL), OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET);

// Specify maximum upload size
const fieldSize = UPLOAD_FIELD_SIZE || 1024 * 1024 * 1024; // 1gb
const upload = multer({ limits: { fieldSize } });
api.use(json({ limit: fieldSize }));

api.use(logRequests());

// Health check endpoint
api.get("/status", async (req, res) => {
  res.json({
    version: VERSION,
    database: await query("SELECT 'ok' AS health").then((r) => r[0]),
  });
});

api.get("/login", async (req, res, next) => {
  try {
    const sess = req.session;

    // Initially, we need to build the authorization URL and redirect the user to the authorization server.
    if (!req.query.code) {
      sess.oidc = {
        codeVerifier: client.randomPKCECodeVerifier(),
        state: client.randomState(),
        nonce: client.randomNonce(),
      };

      const codeChallenge = await client.calculatePKCECodeChallenge(sess.oidc.codeVerifier);

      const authUrl = client.buildAuthorizationUrl(oidcConfig, {
        response_type: "code",
        redirect_uri: OAUTH_CALLBACK_URL,
        scope: "openid profile email",
        state: sess.oidc.state,
        nonce: sess.oidc.nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        prompt: "login",
      });

      return res.redirect(authUrl.toString());
    }

    // After we receive the authorization code, we need to exchange it for an access token.
    const redirectUrl = new URL(req.originalUrl, `${req.protocol}://${req.get("host")}`);
    const checks = {
      expectedState: sess.oidc.state,
      expectedNonce: sess.oidc.nonce,
      pkceCodeVerifier: sess.oidc.codeVerifier,
    };
    const tokenSet = await client.authorizationCodeGrant(oidcConfig, redirectUrl, checks);

    // Fetch user info using the access token and store it in the session
    const userinfo = await client.fetchUserInfo(oidcConfig, tokenSet.access_token, tokenSet.claims().sub);
    sess.user = { tokenSet, userinfo };
    return res.redirect("/");
  } catch (err) {
    return next(err);
  }
});

api.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

api.get("/session", (req, res) => {
  res.json({
    authenticated: Boolean(req.session?.user),
    expires: req.session?.expires,
    user: req.session?.user,
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
      },
    ],
  });
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
