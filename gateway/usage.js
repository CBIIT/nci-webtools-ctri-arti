import db, { Model, Usage, User } from "database";
import { eq } from "drizzle-orm";

/**
 * Track model usage and update user's remaining balance.
 * Shared between monolith mode (gateway client) and microservice mode (gateway api).
 */
export async function trackModelUsage(userID, modelValue, ip, usageData, { type, agentID, messageID } = {}) {
  try {
    if (!userID || !usageData || !modelValue) return;

    const [model] = await db.select().from(Model).where(eq(Model.internalName, modelValue)).limit(1);
    if (!model) return;

    const inputTokens = Math.max(0, parseInt(usageData.inputTokens) || 0);
    const outputTokens = Math.max(0, parseInt(usageData.outputTokens) || 0);
    const cacheReadTokens = Math.max(0, parseInt(usageData.cacheReadInputTokens) || 0);
    const cacheWriteTokens = Math.max(0, parseInt(usageData.cacheWriteInputTokens) || 0);

    const inputCost = (inputTokens / 1000) * (model.cost1kInput || 0);
    const outputCost = (outputTokens / 1000) * (model.cost1kOutput || 0);
    const cacheReadCost = (cacheReadTokens / 1000) * (model.cost1kCacheRead || 0);
    const cacheWriteCost = (cacheWriteTokens / 1000) * (model.cost1kCacheWrite || 0);
    const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;

    const [usageRecord] = await db.insert(Usage).values({
      userID,
      modelID: model.id,
      type: type || null,
      agentID: agentID || null,
      messageID: messageID || null,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      cost: totalCost,
    }).returning();

    if (totalCost > 0) {
      const [user] = await db.select().from(User).where(eq(User.id, userID)).limit(1);
      if (user && user.remaining !== null && user.budget !== null) {
        await db.update(User).set({
          remaining: Math.max(0, (user.remaining || 0) - totalCost),
        }).where(eq(User.id, userID));
      }
    }

    return usageRecord;
  } catch (error) {
    console.error("Error tracking model usage:", error);
  }
}
