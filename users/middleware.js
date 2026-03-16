import { getUser, getUserByApiKey } from "shared/clients/users.js";

export function requireRole(requiredRole) {
  return async (req, res, next) => {
    try {
      const apiKey = req.headers["x-api-key"];
      const id = req.session?.user?.id;

      if (!apiKey && !id) {
        return requiredRole ? res.status(401).json({ error: "Authentication required" }) : next();
      }

      const result = apiKey ? await getUserByApiKey(apiKey) : await getUser(id);

      if (!result) {
        return requiredRole ? res.status(401).json({ error: "Authentication required" }) : next();
      }

      const role = result.Role;
      if (
        requiredRole &&
        role?.id !== 1 &&
        !(role?.name === requiredRole || role?.id === +requiredRole)
      ) {
        return res.status(403).json({ error: "Authorization required" });
      }

      req.session ||= {};
      req.session.user = result;
      next();
    } catch (err) {
      next(err);
    }
  };
}
