/**
 * Field-based extraction pipeline using Bedrock structured output (outputConfig)
 *
 * Ported from scripts/consent-crafter/extract.mjs for browser use.
 *
 * Uses a system prompt (instructions + consent library) and user message (protocol)
 * so that Bedrock caches the system prompt after the first chunk request. All 4 chunk
 * requests share the same system + user content — only outputConfig differs — so
 * chunks 2-4 get full cache hits on input tokens.
 *
 * Results are merged into a single object with all 76 fields.
 */

import { buildChunkedSchemas, buildOutputConfig } from "./schema.js";

/**
 * Build the system prompt with all content (instructions + consent library + protocol).
 *
 * Everything goes in the system prompt so Bedrock caches the entire input after the
 * first chunk request. Chunks 2-4 get full cache hits — only outputConfig differs.
 *
 * @param {string} promptTemplate - prompt-v3.txt content
 * @param {string} protocolText - Full protocol document text
 * @param {string} consentLibrary - consent-library.txt content
 * @returns {string} Fully assembled system prompt
 */
function buildSystemPrompt(promptTemplate, protocolText, consentLibrary) {
  const today = new Date();
  const todayStr = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;

  return promptTemplate
    .replaceAll("${consentLibrary}", consentLibrary)
    .replaceAll("${protocol}", protocolText)
    .replaceAll("${today}", todayStr);
}

/**
 * Run field-based extraction using Bedrock structured output.
 * Sends 4 requests (one per schema chunk) with a shared system prompt.
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
  const system = buildSystemPrompt(promptTemplate, protocolText, consentLibrary || "");
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
      system,
      messages: [{ role: "user", content: [{ text: "Extract the fields specified by the output schema." }] }],
      outputConfig,
    });

    // Strip markdown fences if present (model may wrap JSON in ```json ... ```)
    let jsonText = responseText.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    let data;
    try {
      data = JSON.parse(jsonText);
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
