import db, { Model } from "database";

import { eq } from "drizzle-orm";
import { recordUsage } from "shared/clients/users.js";

const AWS_GUARDRAILS_MODEL = "aws-guardrails";

function collectGuardrailAssessments(guardrailTrace = {}) {
  const assessments = [];

  if (guardrailTrace.inputAssessment) {
    assessments.push(...Object.values(guardrailTrace.inputAssessment).filter(Boolean));
  }

  if (guardrailTrace.outputAssessments) {
    for (const outputAssessments of Object.values(guardrailTrace.outputAssessments)) {
      if (Array.isArray(outputAssessments)) {
        assessments.push(...outputAssessments.filter(Boolean));
      }
    }
  }

  return assessments;
}

function normalizeGuardrailUsageItems(trace) {
  const totals = new Map();
  const assessments = collectGuardrailAssessments(trace?.guardrail);

  for (const assessment of assessments) {
    const usage = assessment?.invocationMetrics?.usage;
    if (!usage) continue;

    const add = (unit, quantity) => {
      if (!quantity || quantity <= 0) return;
      totals.set(unit, (totals.get(unit) || 0) + quantity);
    };

    add("topic_policy_units", usage.topicPolicyUnits);
    add("content_policy_units", usage.contentPolicyUnits);
    add("content_policy_image_units", usage.contentPolicyImageUnits);
    add("sensitive_information_policy_units", usage.sensitiveInformationPolicyUnits);
    add("word_policy_units", usage.wordPolicyUnits);
    add("contextual_grounding_policy_units", usage.contextualGroundingPolicyUnits);

    const automatedReasoningQuantity =
      (usage.automatedReasoningPolicyUnits || 0) * (usage.automatedReasoningPolicies || 0);
    add("automated_reasoning_policy_units", automatedReasoningQuantity);
  }

  return Array.from(totals.entries()).map(([unit, quantity]) => ({ quantity, unit }));
}

/**
 * Generalized usage tracking. Resolves model pricing, computes costs,
 * then delegates row insertion + budget deduction to the users service.
 *
 * @param {number} userID
 * @param {string} modelValue - Model internalName (e.g. "us.anthropic.claude-sonnet-4-6") or service key (e.g. "aws-translate")
 * @param {Array<{quantity: number, unit: string, unitCost?: number}>} usageItems
 * @param {{ type?: string, agentID?: number, messageID?: number, requestId?: string }} options
 */
export async function trackUsage(
  userID,
  modelValue,
  usageItems,
  { type, agentID, messageID, requestId } = {}
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

    for (const { quantity, unit, unitCost: usageUnitCost } of usageItems) {
      if (!quantity || quantity <= 0) continue;
      const unitCost = usageUnitCost ?? pricing[unit] ?? 0;
      const cost = quantity * unitCost;
      rows.push({
        userID,
        modelID: model.id,
        requestId: requestId ?? null,
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
  { type, agentID, messageID, requestId, trace } = {}
) {
  const usageItems = [];
  if (usageData?.inputTokens)
    usageItems.push({ quantity: usageData.inputTokens, unit: "input_tokens" });
  if (usageData?.outputTokens)
    usageItems.push({ quantity: usageData.outputTokens, unit: "output_tokens" });
  if (usageData?.cacheReadInputTokens)
    usageItems.push({ quantity: usageData.cacheReadInputTokens, unit: "cache_read_tokens" });
  if (usageData?.cacheWriteInputTokens)
    usageItems.push({ quantity: usageData.cacheWriteInputTokens, unit: "cache_write_tokens" });

  const records = [];

  if (usageItems.length) {
    const modelRecords = await trackUsage(userID, modelValue, usageItems, {
      type,
      agentID,
      messageID,
      requestId,
    });
    if (modelRecords?.length) records.push(...modelRecords);
  }

  const guardrailItems = normalizeGuardrailUsageItems(trace);
  if (guardrailItems.length) {
    const guardrailRecords = await trackUsage(userID, AWS_GUARDRAILS_MODEL, guardrailItems, {
      type: "guardrail",
      agentID,
      messageID,
      requestId,
    });
    if (guardrailRecords?.length) records.push(...guardrailRecords);
  }

  return records.length ? records : undefined;
}
