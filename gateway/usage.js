import db, { Model, Usage, User } from "database";

import { eq, sql } from "drizzle-orm";

/**
 * Generalized usage tracking. Inserts one Usage row per consumption dimension
 * and deducts the total cost from the user's remaining balance.
 *
 * @param {number} userID
 * @param {string} modelValue - Model internalName (e.g. "us.anthropic.claude-sonnet-4-6") or service key (e.g. "aws-translate")
 * @param {Array<{quantity: number, unit: string}>} usageItems
 * @param {{ type?: string, agentID?: number, messageID?: number }} options
 */
export async function trackUsage(
  userID,
  modelValue,
  usageItems,
  { type, agentID, messageID } = {}
) {
  try {
    if (!userID || !usageItems?.length || !modelValue) return;

    const [model] = await db
      .select()
      .from(Model)
      .where(eq(Model.internalName, modelValue))
      .limit(1);
    if (!model) return;

    const pricing = model.pricing || {};
    let totalCost = 0;
    const rows = [];

    for (const { quantity, unit } of usageItems) {
      if (!quantity || quantity <= 0) continue;
      const unitCost = pricing[unit] || 0;
      const cost = quantity * unitCost;
      totalCost += cost;
      rows.push({
        userID,
        modelID: model.id,
        type: type ?? null,
        agentID: agentID ?? null,
        messageID: messageID ?? null,
        quantity,
        unit,
        unitCost,
        cost,
      });
    }

    if (!rows.length) return;

    const inserted = await db.insert(Usage).values(rows).returning();

    if (totalCost > 0) {
      await db
        .update(User)
        .set({
          remaining: sql`GREATEST(0, COALESCE(${User.remaining}, 0) - ${totalCost})`,
        })
        .where(eq(User.id, userID));
    }

    return inserted;
  } catch (error) {
    console.error("Error tracking usage:", error);
  }
}

/**
 * Backward-compatible wrapper that converts the old token-based format
 * into generalized usageItems and delegates to trackUsage.
 */
export async function trackModelUsage(
  userID,
  modelValue,
  ip,
  usageData,
  { type, agentID, messageID } = {}
) {
  if (!usageData) return;

  const usageItems = [];
  if (usageData.inputTokens)
    usageItems.push({ quantity: usageData.inputTokens, unit: "input_tokens" });
  if (usageData.outputTokens)
    usageItems.push({ quantity: usageData.outputTokens, unit: "output_tokens" });
  if (usageData.cacheReadInputTokens)
    usageItems.push({ quantity: usageData.cacheReadInputTokens, unit: "cache_read_tokens" });
  if (usageData.cacheWriteInputTokens)
    usageItems.push({ quantity: usageData.cacheWriteInputTokens, unit: "cache_write_tokens" });

  return trackUsage(userID, modelValue, usageItems, { type, agentID, messageID });
}
