import { Router, json } from "express";
import { QueryTypes } from "sequelize";
import { runModel, runBedrockModel } from "./inference.js";
import { authMiddleware, proxyMiddleware, logRequests, logErrors, loginMiddleware } from "./middleware.js";
import { search } from "./utils.js";
import { translate, getLanguages } from "./translate.js";
import { sendFeedback } from "./email.js";
import db, { User } from "./database.js";

const { VERSION } = process.env;
const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB
api.use(logRequests());

api.get("/status", async (req, res) => {
  res.json({
    version: VERSION,
    database: await db.query("SELECT 'ok' AS health", { plain: true, type: QueryTypes.SELECT }),
  });
});

api.get("/login", loginMiddleware, async (req, res) => {
  const { session } = req;
  const { email, first_name: firstName, last_name: lastName } = session.userinfo;
  if (!email) return res.redirect("/?error=missing_email");
  session.user = (await User.findOne({ where: { email } })) || (await User.create({ email, firstName, lastName, status: "pending" }));
  res.redirect(session.destination || "/");
});

api.get("/logout", (req, res) => {
  const destination = req.query.destination || "/";
  req.session.destroy(() => res.redirect(destination));
});

api.get("/session", (req, res) => {
  const { session } = req;
  session.touch();
  session.expires = session.cookie.expires;
  res.json({
    expires: session.expires,
    user: session.user,
  });
});

api.get("/user", authMiddleware, async (req, res) => {
  res.json(await User.findAll({ where: req.query }));
});

api.post("/user", authMiddleware, async (req, res) => {
  res.json(await User.create(req.body));
});

api.put("/user", authMiddleware, async (req, res) => {
  const { id, ...data } = req.body;
  const user = await User.findByPk(id);
  if (!user) return res.status(404).json({ error: "User not found" });
  await user.update(data);
  res.json(user);
});

api.delete("/user", authMiddleware, async (req, res) => {
  const { id } = req.body;
  const user = await User.findByPk(id);
  if (!user) return res.status(404).json({ error: "User not found" });
  await user.destroy();
  res.json(user);
});

api.get("/search", authMiddleware, async (req, res) => {
  res.json(await search(req.query));
});

api.all("/browse/*url", authMiddleware, proxyMiddleware);

api.post("/translate", authMiddleware, async (req, res) => {
  res.json(await translate(req.body));
});

api.get("/translate/languages", authMiddleware, async (req, res) => {
  res.json(await getLanguages());
});

api.post("/model", authMiddleware, async (req, res) => {
  const results = await runModel(req.body);
  return req.body?.stream ? results.pipeDataStreamToResponse(res) : res.json(results);
});

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
  const results = await runBedrockModel(model, messages, system, thoughtBudget, tools, stream);
  if (stream) {
    for await (const message of results?.stream || []) {
      res.write(JSON.stringify(message) + "\n");
    }
    res.end();
  } else {
    res.json(results);
  }
});

api.post("/feedback", authMiddleware, async (req, res) => {
  const { feedback, context } = req.body;
  const from = req.session.user?.userinfo?.email;
  const results = await sendFeedback({ from, feedback, context });
  return res.json(results);
});

api.use(logErrors());

export default api;
