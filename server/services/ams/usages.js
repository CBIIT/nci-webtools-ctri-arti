import { Op, fn, col } from "sequelize";
import { User, Role, Usage, Agent } from "../database.js";

export async function getUsages(userId, query = {}) {
  const pastDays = parseInt(query.pastDays) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - pastDays);
  startDate.setHours(0, 0, 0, 0);

  const where = { createdAt: { [Op.gte]: startDate } };
  if (query.userID) where.userId = query.userID;
  if (query.agentID) where.agentId = query.agentID;

  const include = [];
  if (query.role || query.status) {
    const userWhere = {};
    if (query.status) userWhere.status = query.status;

    const userInclude = { model: User, attributes: [], where: userWhere };
    if (query.role) {
      userInclude.include = [{ model: Role, attributes: [], where: { name: query.role } }];
    }
    include.push(userInclude);
  }

  return Usage.findAll({
    where,
    include,
    attributes: [
      [col("userId"), "userID"],
      [col("agentId"), "agentID"],
      [fn("SUM", col("cost")), "cost"],
    ],
    group: ["userId", "agentId"],
    raw: true,
  });
}
