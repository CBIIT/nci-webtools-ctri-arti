/**
 * Consent form generation pipeline.
 *
 * Orchestrates the two-step process:
 *   1. Filter the 62-section consent library to ~15-20 relevant sections
 *   2. Run the proven field-based extraction pipeline with the filtered library
 *
 * The filtered library text is formatted identically to consent-library.txt
 * and fed into runFieldExtraction(), which uses prompt-v3.txt and the 4-chunk
 * schema strategy to produce all 76 consent form fields.
 */

import { filterConsentLibrary } from "./consent-library-filter.js";
import { runFieldExtraction } from "/pages/tools/consent-crafter-v2/extract.js";

/**
 * Build consent library text from matched keys, matching consent-library.txt format.
 *
 * Each section is formatted as:
 *   KEY_NAME
 *   [full text from consent-library.json value]
 *
 * Sections are separated by blank lines.
 *
 * @param {Object} consentLibrary - Parsed consent-library.json { title: description, ... }
 * @param {string[]} matchedKeys - Section keys to include
 * @returns {string} Formatted library text
 */
function buildFilteredLibraryText(consentLibrary, matchedKeys) {
  return matchedKeys
    .map((key) => {
      const text = consentLibrary[key] || "";
      return `${key}\n${text}`;
    })
    .join("\n\n");
}

/**
 * Generate a complete consent form by filtering the consent library and
 * running field-based extraction.
 *
 * @param {Object} options
 * @param {string} options.protocolText - Full protocol document text
 * @param {Object} options.consentLibrary - Parsed consent-library.json { title: description, ... }
 * @param {string} options.promptTemplate - prompt-v3.txt content
 * @param {Object} options.fullSchema - consent-schema.json parsed object
 * @param {string} options.model - Model ID (e.g. "us.anthropic.claude-opus-4-6-v1")
 * @param {Function} options.runModelFn - (params) => responseText
 * @param {Function} [options.onProgress] - Optional progress callback
 * @returns {Promise<{filterResult: {reasoning: string, matched_keys: string[]}, extraction: Object}>}
 */
export async function generateConsentForm({
  protocolText,
  consentLibrary,
  promptTemplate,
  fullSchema,
  model,
  runModelFn,
  onProgress,
}) {
  // Step 1: Filter consent library to relevant sections
  console.log("[consent-form] Step 1: Filtering consent library...");
  onProgress?.({ status: "filtering", message: "Filtering consent library to relevant sections..." });

  const filterResult = await filterConsentLibrary({
    protocolText,
    consentLibrary,
    model,
    runModelFn,
  });

  console.log(`[consent-form] Filter returned ${filterResult.matched_keys.length} sections`);

  // Step 2: Build filtered library text
  console.log("[consent-form] Step 2: Building filtered library text...");
  const filteredLibraryText = buildFilteredLibraryText(consentLibrary, filterResult.matched_keys);
  console.log(`[consent-form] Filtered library text: ${filteredLibraryText.length} chars`);

  // Step 3: Run field extraction with filtered library
  console.log("[consent-form] Step 3: Running field extraction...");
  const extraction = await runFieldExtraction({
    protocolText,
    promptTemplate,
    consentLibrary: filteredLibraryText,
    fullSchema,
    model,
    runModelFn,
    onProgress,
  });

  console.log(`[consent-form] Extraction complete: ${Object.keys(extraction).length} fields`);

  return { filterResult, extraction };
}
