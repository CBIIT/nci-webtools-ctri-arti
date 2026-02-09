/**
 * Field-based extraction pipeline using Bedrock structured output (outputConfig)
 *
 * Ported from scripts/consent-crafter/extract.mjs for browser use.
 *
 * Sends 4 requests (one per schema chunk), each with the full protocol + prompt.
 * Bedrock's grammar-enforced JSON guarantees valid structured output.
 * Results are merged into a single object with all 76 fields.
 */

import { buildChunkedSchemas, buildOutputConfig } from "./schema.js";

/**
 * Build the full extraction prompt by substituting template variables.
 *
 * @param {string} promptTemplate - prompt-v3.txt content with ${protocol}, ${consentLibrary}, ${today} placeholders
 * @param {string} protocolText - Full protocol document text
 * @param {string} consentLibrary - consent-library.txt content
 * @returns {string} Assembled prompt
 */
function buildPrompt(promptTemplate, protocolText, consentLibrary) {
  const today = new Date();
  const todayStr = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;

  return promptTemplate
    .replaceAll("${consentLibrary}", consentLibrary)
    .replaceAll("${protocol}", protocolText)
    .replaceAll("${today}", todayStr);
}

/**
 * Run field-based extraction using Bedrock structured output.
 * Sends 4 requests (one per schema chunk), each with full protocol + prompt.
 * Returns merged JSON with all 76 fields.
 *
 * @param {Object} options
 * @param {string} options.protocolText - Full protocol document text
 * @param {string} options.promptTemplate - prompt-v3.txt content
 * @param {string} options.consentLibrary - consent-library.txt content
 * @param {Object} options.fullSchema - consent-schema.json parsed object
 * @param {string} options.model - Model ID (e.g. Opus 4.6)
 * @param {Function} options.runModelFn - Function to call /api/model (params => responseText)
 * @param {Function} [options.onProgress] - Progress callback ({status, completed, total, message})
 * @returns {Promise<Object>} Merged extraction result with all fields
 */
export async function runFieldExtraction({
  protocolText,
  promptTemplate,
  consentLibrary,
  fullSchema,
  model,
  runModelFn,
  onProgress,
}) {
  const fullPrompt = buildPrompt(promptTemplate, protocolText, consentLibrary || "");
  const chunks = buildChunkedSchemas(fullSchema);
  const totalChunks = chunks.length;

  // Fields that should be concatenated across chunks (not overwritten)
  const CONCAT_FIELDS = new Set(["references", "reasoning"]);

  const merged = {};

  onProgress?.({ status: "extracting", completed: 0, total: totalChunks, message: "Starting field extraction..." });

  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks[i];

    onProgress?.({
      status: "extracting",
      completed: i,
      total: totalChunks,
      message: `Extracting fields (${i + 1} of ${totalChunks}): ${chunk.label}...`,
    });

    const outputConfig = buildOutputConfig(chunk.subSchema);

    const responseText = await runModelFn({
      model,
      messages: [{ role: "user", content: [{ text: fullPrompt }] }],
      outputConfig,
    });

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Failed to parse structured output for chunk "${chunk.label}": ${e.message}`);
    }

    // Merge into combined result
    for (const [key, value] of Object.entries(data)) {
      if (CONCAT_FIELDS.has(key) && Array.isArray(value) && Array.isArray(merged[key])) {
        merged[key] = [...merged[key], ...value];
      } else {
        merged[key] = value;
      }
    }
  }

  onProgress?.({
    status: "applying",
    completed: totalChunks,
    total: totalChunks,
    message: "Generating consent document...",
  });

  return merged;
}
