import BedrockProvider from "../providers/bedrock.js";
import BaseGuardrail from "./base.js";

/**
 * Bedrock managed guardrail implementation.
 * Supports both inline mode (injected into converse calls) and standalone mode (applyGuardrail).
 * Absorbs all pricing/cost logic from the former guardrail-cost.js.
 */
export default class BedrockGuardrail extends BaseGuardrail {
  /**
   * @param {Object} config
   * @param {string} config.guardrailId - Bedrock guardrail identifier
   * @param {string} [config.guardrailVersion="DRAFT"] - Guardrail version
   * @param {string} [config.trace="disabled"] - Trace mode ("enabled" or "disabled")
   * @param {Object} [config.pricing={}] - Per-policy-unit pricing map
   */
  constructor({ guardrailId, guardrailVersion = "DRAFT", trace = "disabled", pricing = {} }) {
    super({ guardrailId, guardrailVersion, trace, pricing });
    this.provider = new BedrockProvider();
  }

  get supportsInline() {
    return true;
  }

  /**
   * Build guardrailConfig for converse/converseStream input.
   */
  getInlineConfig({ stream } = {}) {
    const { guardrailId, guardrailVersion, trace } = this.config;
    return {
      guardrailIdentifier: guardrailId,
      guardrailVersion,
      trace,
      ...(stream && { streamProcessingMode: "sync" }),
    };
  }

  /**
   * Standalone guardrail check via ApplyGuardrailCommand.
   * @param {string} text - Text to screen
   * @returns {Promise<{ blocked: boolean, cost: number, details?: Object }>}
   */
  async check(text) {
    const { guardrailId, guardrailVersion } = this.config;
    const result = await this.provider.applyGuardrail(guardrailId, guardrailVersion, text);
    const cost = this._calculateCostFromUsage(result.usage);
    return {
      blocked: result.action === "GUARDRAIL_INTERVENED",
      cost,
      details: { assessments: result.assessments },
    };
  }

  /**
   * Extract guardrail cost from converse/converseStream response metadata (inline mode).
   * @param {Object} metadata - The event.metadata from the stream
   * @returns {number}
   */
  calculateCostFromResponse(metadata) {
    return this._calculateCostFromTrace(metadata?.trace?.guardrail);
  }

  /**
   * Calculate cost from a guardrail usage object (direct ApplyGuardrail response).
   * @param {Object} usage - Guardrail usage metrics with policy unit counts
   * @returns {number}
   */
  _calculateCostFromUsage(usage) {
    if (!usage) return 0;
    const p = this.config.pricing;
    let cost = 0;
    cost += (usage.contentPolicyUnits || 0) * (p.contentPolicyUnits || 0);
    cost += (usage.contentPolicyImageUnits || 0) * (p.contentPolicyImageUnits || 0);
    cost += (usage.topicPolicyUnits || 0) * (p.deniedTopicUnits || 0);
    cost += (usage.sensitiveInformationPolicyUnits || 0) * (p.sensitiveInfoUnits || 0);
    cost += (usage.contextualGroundingPolicyUnits || 0) * (p.contextualGroundingUnits || 0);
    return cost;
  }

  /**
   * Calculate cost from a guardrail trace (stream/converse response metadata).
   * Extracts usage from input/output assessments and sums costs.
   * @param {Object} guardrailTrace - Guardrail trace from response metadata
   * @returns {number}
   */
  _calculateCostFromTrace(guardrailTrace) {
    if (!guardrailTrace) return 0;
    let cost = 0;
    const assessments = [];
    // inputAssessment is a dict keyed by guardrail ID → assessment object
    if (guardrailTrace.inputAssessment) {
      assessments.push(...Object.values(guardrailTrace.inputAssessment));
    }
    // outputAssessments is a dict keyed by guardrail ID → array of assessment objects
    if (guardrailTrace.outputAssessments) {
      for (const list of Object.values(guardrailTrace.outputAssessments)) {
        assessments.push(...list);
      }
    }
    for (const assessment of assessments) {
      const u = assessment.invocationMetrics?.usage;
      if (!u) continue;
      cost += this._calculateCostFromUsage(u);
    }
    return cost;
  }
}
