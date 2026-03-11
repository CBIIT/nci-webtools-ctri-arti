import db, { Usage, User } from "database";

import { and, eq, gte, lte, sql } from "drizzle-orm";
import { Router } from "express";
import { routeHandler } from "shared/utils.js";

const router = Router();

// GET /usages — List usage records with filters (admin only)
router.get(
  "/",
  routeHandler(async (req, res) => {
    const { userID, agentID, status, role, startDate, endDate } = req.query;
    const conditions = [];

    if (userID) conditions.push(eq(Usage.userID, Number(userID)));
    if (agentID) conditions.push(eq(Usage.agentID, Number(agentID)));
    if (startDate) conditions.push(gte(Usage.createdAt, new Date(startDate)));
    if (endDate) {
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lte(Usage.createdAt, end));
    }
    if (status) conditions.push(eq(User.status, status));
    if (role) conditions.push(eq(User.roleID, Number(role)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const columns = {
      userID: Usage.userID,
      agentID: Usage.agentID,
      cost: sql`SUM(${Usage.cost})`.as("cost"),
    };

    let query = db.select(columns).from(Usage);
    if (status || role) query = query.innerJoin(User, eq(Usage.userID, User.id));
    const usages = await query.where(where).groupBy(Usage.userID, Usage.agentID);
    res.json(usages);
  })
);

export default router;
