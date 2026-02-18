import BedrockGuardrail from "./bedrock-guardrail.js";
import LlmGuardrail from "./llm-guardrail.js";

const types = { bedrock: BedrockGuardrail, llm: LlmGuardrail };

/**
 * Register a custom guardrail type for use in the factory.
 * @param {string} name - Type key (e.g. "keyword-filter")
 * @param {typeof import("./base.js").default} GuardrailClass - Class extending BaseGuardrail
 */
export function registerGuardrailType(name, GuardrailClass) {
  types[name] = GuardrailClass;
}

/**
 * Factory that returns a single guardrail instance based on GUARDRAIL_TYPE.
 *
 * GUARDRAIL_TYPE values:
 *   "bedrock" → BedrockGuardrail (managed guardrail via ApplyGuardrail / inline config)
 *   "llm"     → LlmGuardrail (model-based screening, e.g. Nova Lite)
 *   unset     → null (guardrails disabled)
 *
 * @returns {import("./base.js").default | null}
 */
export function getGuardrail() {
  const { GUARDRAIL_TYPE = "bedrock" } = process.env;

  if (!(GUARDRAIL_TYPE in types)) {
    throw new Error(`Unknown GUARDRAIL_TYPE "${GUARDRAIL_TYPE}". Available: ${Object.keys(types).join(", ")}`);
  }

  const {
    BEDROCK_GUARDRAIL_ID,
    BEDROCK_GUARDRAIL_VERSION = "DRAFT",
    BEDROCK_GUARDRAIL_TRACE = "disabled",
    BEDROCK_GUARDRAIL_PRICING,
    GUARDRAIL_SCREEN_MODEL,
    GUARDRAIL_SCREEN_PROMPT,
    GUARDRAIL_SCREEN_COST_INPUT,
    GUARDRAIL_SCREEN_COST_OUTPUT,
  } = process.env;

  if (GUARDRAIL_TYPE === "bedrock") {
    if (!BEDROCK_GUARDRAIL_ID) return null;
    return new types.bedrock({
      guardrailId: BEDROCK_GUARDRAIL_ID,
      guardrailVersion: BEDROCK_GUARDRAIL_VERSION,
      trace: BEDROCK_GUARDRAIL_TRACE,
      pricing: JSON.parse(BEDROCK_GUARDRAIL_PRICING || "{}"),
    });
  }

  if (GUARDRAIL_TYPE === "llm") {
    if (!GUARDRAIL_SCREEN_MODEL) {
      throw new Error("GUARDRAIL_TYPE=llm requires GUARDRAIL_SCREEN_MODEL");
    }
    return new types.llm({
      modelId: GUARDRAIL_SCREEN_MODEL,
      prompt: GUARDRAIL_SCREEN_PROMPT || undefined,
      cost1kInput: parseFloat(GUARDRAIL_SCREEN_COST_INPUT) || 0,
      cost1kOutput: parseFloat(GUARDRAIL_SCREEN_COST_OUTPUT) || 0,
    });
  }

  // Future registered types — instantiate with all env vars as generic config
  const GuardrailClass = types[GUARDRAIL_TYPE];
  return new GuardrailClass(process.env);
}
