import { Router, json } from "express";
import { loginMiddleware } from "../middleware.js";
import { User, Role } from "../database.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB

api.get("/login", loginMiddleware, async (req, res) => {
  const { session } = req;
  const { email, first_name: firstName, last_name: lastName } = session.userinfo;
  if (!email) return res.redirect("/?error=missing_email");
  session.user = (await User.findOne({ where: { email } })) || (await User.create({ email, firstName, lastName, status: "active", roleId: 3, limit: 5 }));
  res.redirect(session.destination || "/");
});

api.get("/logout", (req, res) => {
  const destination = req.query.destination || "/";
  req.session.destroy(() => res.redirect(destination));
});

api.get("/session", async (req, res) => {
  const { session } = req;
  session.touch();
  session.expires = session.cookie.expires;

  let user = session.user;
  if (user) {
    user = await User.findByPk(user.id, { include: [{ model: Role }] });
  }

  res.json({
    user,
    expires: session.expires,
  });
});

export default api;
