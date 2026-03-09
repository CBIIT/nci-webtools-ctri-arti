import { ApplyGuardrailCommand } from "@aws-sdk/client-bedrock-runtime";

const GUARDRAIL_ID = process.env.BEDROCK_GUARDRAIL_ID;
const GUARDRAIL_VERSION = process.env.BEDROCK_GUARDRAIL_VERSION || "DRAFT";
const GUARDRAIL_PRICING = JSON.parse(process.env.BEDROCK_GUARDRAIL_PRICING || "{}");

/**
 * Whether guardrails are enabled (requires a guardrail ID).
 */
export const guardrailsEnabled = !!GUARDRAIL_ID;

/**
 * Extract text content from chat messages for guardrail evaluation.
 *
 * @param {Array} messages - Chat messages array
 * @returns {string} Combined text content
 */
function extractText(messages) {
  if (!Array.isArray(messages)) return "";
  return messages
    .flatMap((m) => {
      if (typeof m === "string") return m;
      const content = m.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content.map((c) => c.text || "").filter(Boolean);
      }
      return [];
    })
    .join("\n");
}

/**
 * Calculate guardrail cost from usage units and pricing config.
 *
 * @param {Object} usage - GuardrailUsage from Bedrock response
 * @returns {number} Total cost in dollars
 */
export function calculateGuardrailCost(usage) {
  if (!usage || !GUARDRAIL_PRICING) return 0;
  return (
    (usage.contentPolicyUnits || 0) * (GUARDRAIL_PRICING.contentPolicyUnits || 0) +
    (usage.contentPolicyImageUnits || 0) * (GUARDRAIL_PRICING.contentPolicyImageUnits || 0) +
    (usage.topicPolicyUnits || 0) * (GUARDRAIL_PRICING.deniedTopicUnits || 0) +
    (usage.sensitiveInformationPolicyUnits || 0) * (GUARDRAIL_PRICING.sensitiveInfoUnits || 0) +
    (usage.contextualGroundingPolicyUnits || 0) *
      (GUARDRAIL_PRICING.contextualGroundingUnits || 0) +
    (usage.automatedReasoningPolicyUnits || 0) * (GUARDRAIL_PRICING.automatedReasoningUnits || 0)
  );
}

/**
 * Apply Bedrock guardrail to content.
 *
 * @param {Object} provider - BedrockProvider instance (must have .client)
 * @param {string} source - "INPUT" or "OUTPUT"
 * @param {Array|string} messages - Content to evaluate
 * @returns {Promise<{ action: string, blocked: boolean, output: string|null, usage: Object|null, cost: number }>}
 */
export async function applyGuardrail(provider, source, messages) {
  if (!guardrailsEnabled) {
    return { action: "NONE", blocked: false, output: null, usage: null, cost: 0 };
  }

  const text = typeof messages === "string" ? messages : extractText(messages);
  if (!text.trim()) {
    return { action: "NONE", blocked: false, output: null, usage: null, cost: 0 };
  }

  const command = new ApplyGuardrailCommand({
    guardrailIdentifier: GUARDRAIL_ID,
    guardrailVersion: GUARDRAIL_VERSION,
    source,
    content: [{ text: { text } }],
  });

  const response = await provider.client.send(command);
  const blocked = response.action === "GUARDRAIL_INTERVENED";
  const output = blocked && response.outputs?.length > 0 ? response.outputs[0].text : null;
  const cost = calculateGuardrailCost(response.usage);

  return {
    action: response.action,
    blocked,
    output,
    usage: response.usage || null,
    cost,
  };
}
