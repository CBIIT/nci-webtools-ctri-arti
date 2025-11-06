/**
 * The Model IDs for various AI models.
 */
export const MODEL_OPTIONS = Object.freeze({
  AWS_BEDROCK: {
    SONNET: {
      v4_5: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      v3_7: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    },
    OPUS: {
      v4_1: "us.anthropic.claude-opus-4-1-20250805-v1:0",
    },
    HAIKU: {
      v4_5: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
      v3_5: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
    },
    MAVERICK: {
      v4_0_17b: "us.meta.llama4-maverick-17b-instruct-v1:0",
    },
    SCOUT: {
      v4_0_17b: "us.meta.llama4-scout-17b-instruct-v1:0",
    },
  },
  GOOGLE: {
    GEMINI: {
      v2_5_PRO: "gemini-2.5-pro-preview-06-05",
      v2_5_FLASH: "gemini-2.5-flash-preview-04-17",
    },
  },
});
