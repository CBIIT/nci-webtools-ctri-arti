/**
 * Field-based extraction pipeline — 2-chunk approach
 *
 * Ported from scripts/consent-crafter-v2/pipeline.mjs for browser use.
 *
 * Uses 2 Bedrock calls with a shared, cached system prompt:
 *   Chunk 1: Study identity & procedures (38 fields)
 *   Chunk 2: Risks, benefits, alternatives & COI (42 fields)
 *
 * The full schema, consent library, and protocol go in the system prompt.
 * The user message is a short instruction requesting specific fields as raw JSON.
 * No outputConfig — the model returns freeform JSON which we parse.
 */

// Schema chunks — split at the template's narrative boundary
const SCHEMA_CHUNKS = [
  {
    label: "Study identity & procedures",
    fields: [
      "references", "reasoning",
      "pi_name", "study_title", "study_site", "cohort", "consent_version",
      "contact_name", "contact_phone", "contact_email",
      "other_contact_name", "other_contact_phone", "other_contact_email",
      "key_info_why_asked", "key_info_purpose", "key_info_fda_status",
      "key_info_phase", "key_info_phase_explanation",
      "key_info_happenings", "key_info_benefits", "key_info_risks",
      "key_info_alternatives", "key_info_voluntariness",
      "parent_permission", "impaired_adults",
      "study_purpose", "why_you_asked",
      "is_investigational", "approach_investigational_drug_name", "investigational_condition",
      "is_fda_approved_off_label", "fda_approved_indication", "research_testing_reason",
      "study_procedures_intro", "study_procedures", "study_duration", "accrual_ceiling", "multisite_count",
    ],
  },
  {
    label: "Risks, benefits, alternatives & COI",
    fields: [
      "references", "reasoning",
      "risks_intro", "drug_risks", "procedure_risks",
      "pregnancy_risks", "radiation_risks",
      "has_potential_benefits", "no_potential_benefits",
      "benefits_description", "benefits_others_reason",
      "alternatives_list", "alternatives_advice",
      "return_of_results", "early_withdrawal",
      "disease_condition",
      "is_open_repository", "is_closed_repository",
      "genomic_non_sensitive", "genomic_sensitive",
      "may_anonymize", "will_not_anonymize",
      "specimen_storage_duration",
      "no_payment", "has_payment", "payment_details", "partial_payment_details",
      "reimbursement_info", "cost_additional",
      "coi_no_agreements", "coi_tech_license", "coi_product_description", "coi_product_name",
      "coi_crada", "coi_cta", "coi_company_name", "coi_product_provision",
      "coi_through_program", "coi_program_name",
      "sponsor_name", "manufacturer_name", "product_name",
    ],
  },
];

// Fields that should be concatenated across chunks (not overwritten)
const CONCAT_FIELDS = new Set(["references", "reasoning"]);

/**
 * Build the system prompt with all content.
 *
 * Everything goes in the system prompt so Bedrock caches the entire input after
 * the first chunk request. Chunk 2 gets a full cache hit — only the user message differs.
 *
 * @param {string} promptTemplate - prompt-v3.txt content (with ${...} placeholders)
 * @param {string} protocolText - Full protocol document text
 * @param {string} consentLibrary - consent-library.txt content
 * @param {Object} fullSchema - consent-schema.json parsed object
 * @param {string} [templateAnalysis] - Optional template structure analysis
 * @param {string} [fieldDescriptions] - Optional field descriptions from schema
 * @returns {string} Fully assembled system prompt
 */
function buildSystemPrompt(promptTemplate, protocolText, consentLibrary, fullSchema, templateAnalysis, fieldDescriptions) {
  const today = new Date();
  const todayStr = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;
  const schemaJson = JSON.stringify(fullSchema, null, 2);

  return promptTemplate
    .replaceAll("${consentLibrary}", consentLibrary || "")
    .replaceAll("${protocol}", protocolText)
    .replaceAll("${today}", todayStr)
    .replaceAll("${schema}", schemaJson)
    .replaceAll("${templateAnalysis}", templateAnalysis || "")
    .replaceAll("${fieldDescriptions}", fieldDescriptions || "");
}

/**
 * Run field-based extraction using 2-chunk Bedrock calls.
 * Returns merged JSON with all fields.
 *
 * @param {Object} options
 * @param {string} options.protocolText - Full protocol document text
 * @param {string} options.promptTemplate - prompt-v3.txt content
 * @param {string} options.consentLibrary - consent-library.txt content
 * @param {Object} options.fullSchema - consent-schema.json parsed object
 * @param {string} options.model - Model ID (e.g. Opus 4.6)
 * @param {Function} options.runModelFn - Function to call /api/model (params => responseText)
 * @param {Function} [options.onProgress] - Progress callback ({status, completed, total, message})
 * @param {string} [options.templateAnalysis] - Template structure analysis text
 * @param {string} [options.fieldDescriptions] - Schema field descriptions text
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
  templateAnalysis,
  fieldDescriptions,
}) {
  const system = buildSystemPrompt(promptTemplate, protocolText, consentLibrary || "", fullSchema, templateAnalysis, fieldDescriptions);
  const totalChunks = SCHEMA_CHUNKS.length;

  const merged = {};

  onProgress?.({ status: "extracting", completed: 0, total: totalChunks, message: "Starting field extraction..." });

  for (let i = 0; i < totalChunks; i++) {
    const chunk = SCHEMA_CHUNKS[i];

    onProgress?.({
      status: "extracting",
      completed: i,
      total: totalChunks,
      message: `Extracting fields (${i + 1} of ${totalChunks}): ${chunk.label}...`,
    });

    // Build user message requesting specific fields as raw JSON
    const fieldList = chunk.fields.join(", ");
    const userMessage = [
      `Extract ONLY these fields from the protocol: ${fieldList}`,
      "",
      `Return a JSON object with exactly these ${chunk.fields.length} keys. Follow all instructions in the system prompt for writing style, consent library usage, and field completeness.`,
      "",
      "Return ONLY the raw JSON object — no markdown fencing, no explanation, no text before or after the JSON.",
    ].join("\n");

    const responseText = await runModelFn({
      model,
      system,
      messages: [{ role: "user", content: [{ text: userMessage }] }],
    });

    // Parse JSON from response — strip markdown fencing if present
    let jsonText = responseText.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    } else if (!jsonText.startsWith("{")) {
      const fencedMatch = jsonText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
      if (fencedMatch) {
        jsonText = fencedMatch[1];
      } else {
        const braceMatch = jsonText.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          jsonText = braceMatch[0];
        }
      }
    }

    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      throw new Error(`Failed to parse JSON for chunk "${chunk.label}": ${e.message}\nResponse preview: ${responseText.slice(0, 500)}`);
    }

    // Merge: concatenate array fields (references, reasoning), overwrite others
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
