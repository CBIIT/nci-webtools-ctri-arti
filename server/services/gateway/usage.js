import { Model, Usage, User } from "../database.js";

/**
 * Track model usage and update user's remaining balance.
 * Shared between monolith mode (gateway client) and microservice mode (gateway api).
 */
export async function trackModelUsage(userId, modelValue, ip, usageData) {
  try {
    if (!userId || !usageData || !modelValue) return;

    const model = await Model.findOne({ where: { internalName: modelValue } });
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

    const usageRecord = await Usage.create({
      userId,
      modelId: model.id,
      ip,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      cost: totalCost,
    });

    if (totalCost > 0) {
      const user = await User.findByPk(userId);
      if (user && user.remaining !== null && user.limit !== null) {
        await user.update({
          remaining: Math.max(0, (user.remaining || 0) - totalCost),
        });
      }
    }

    return usageRecord;
  } catch (error) {
    console.error("Error tracking model usage:", error);
  }
}
