/**
 * Base class defining the guardrail interface contract.
 * All guardrail implementations must extend this class.
 */
export default class BaseGuardrail {
  constructor(config) {
    this.config = config;
  }

  /**
   * Whether this guardrail can inject config into converse/converseStream calls.
   * Only Bedrock managed guardrail supports this.
   */
  get supportsInline() {
    return false;
  }

  /**
   * Provider-specific config to inject into converse/converseStream input.
   * @param {{ stream: boolean }} options
   * @returns {Object|undefined}
   */
  getInlineConfig({ stream } = {}) {
    return undefined;
  }

  /**
   * Screen content for policy violations.
   * @param {string} text - The text to check
   * @returns {Promise<{ blocked: boolean, cost: number, details?: Object }>}
   */
  async check(text) {
    throw new Error("not implemented");
  }

  /**
   * Extract guardrail cost from provider response metadata (inline mode).
   * @param {Object} metadata - Response metadata from converse/converseStream
   * @returns {number}
   */
  calculateCostFromResponse(metadata) {
    return 0;
  }
}
