import { getUsersModule } from "./compose.js";

async function resolveIdentity({ sessionUserId, apiKey } = {}) {
  const users = await getUsersModule();
  return users.resolveIdentity({ sessionUserId, apiKey });
}

export function requireRole(requiredRole) {
  return async (req, res, next) => {
    try {
      const roleRequirement = requiredRole ?? true;
      const apiKey = req.headers["x-api-key"];
      const sessionUserId = req.session?.user?.id;

      if (!apiKey && !sessionUserId) {
        return roleRequirement
          ? res.status(401).json({ error: "Authentication required" })
          : next();
      }

      const user = await resolveIdentity({ sessionUserId, apiKey });
      if (!user) {
        return roleRequirement
          ? res.status(401).json({ error: "Authentication required" })
          : next();
      }

      const role = user.Role;
      if (
        roleRequirement !== true &&
        roleRequirement &&
        role?.id !== 1 &&
        !(role?.name === roleRequirement || role?.id === +roleRequirement)
      ) {
        return res.status(403).json({ error: "Authorization required" });
      }

      req.session ||= {};
      req.session.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}
