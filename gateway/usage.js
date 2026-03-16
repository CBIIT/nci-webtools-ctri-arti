import db, { Model } from "database";

import { eq } from "drizzle-orm";
import { recordUsage } from "shared/clients/users.js";

/**
 * Generalized usage tracking. Resolves model pricing, computes costs,
 * then delegates row insertion + budget deduction to the users service.
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
    const rows = [];

    for (const { quantity, unit } of usageItems) {
      if (!quantity || quantity <= 0) continue;
      const unitCost = pricing[unit] || 0;
      const cost = quantity * unitCost;
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

    return recordUsage(userID, rows);
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
