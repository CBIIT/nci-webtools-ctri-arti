/**
 * Schema utilities for Bedrock structured output (outputConfig)
 *
 * Ported from scripts/consent-crafter/schema.mjs for browser use.
 *
 * Bedrock's ConverseCommand supports `outputConfig.textFormat.type = "json_schema"`
 * which guarantees the response is valid JSON matching the schema.
 *
 * Requirements for Bedrock JSON schema:
 * - additionalProperties: false at every object level
 * - All fields in required arrays
 * - No $schema field
 */

/**
 * Schema chunk definitions. Each chunk is a group of related fields that
 * will be extracted in a single Bedrock call. Keep each chunk under ~20
 * top-level required fields so the grammar fits.
 */
export const SCHEMA_CHUNKS = [
  {
    name: "admin_keyinfo",
    label: "Administrative & Key Information",
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
    ],
  },
  {
    name: "study_details",
    label: "Study Purpose, Procedures & FDA Status",
    fields: [
      "references", "reasoning",
      "study_purpose", "why_you_asked",
      "is_investigational", "investigational_drug_name", "investigational_condition",
      "is_fda_approved_off_label", "fda_approved_indication", "research_testing_reason",
      "study_procedures", "study_duration", "accrual_ceiling", "multisite_count",
    ],
  },
  {
    name: "risks",
    label: "Risks (drug, procedure, pregnancy, radiation)",
    fields: [
      "references", "reasoning",
      "risks_intro", "drug_risks", "procedure_risks",
      "pregnancy_risks", "radiation_risks",
    ],
  },
  {
    name: "benefits_data_coi",
    label: "Benefits, Alternatives, Data, Payment & COI",
    fields: [
      "references", "reasoning",
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

/**
 * Recursively ensure every object in the schema has:
 * - additionalProperties: false
 * - All properties listed in required
 * - No description fields (to reduce grammar size)
 */
export function adaptSchemaForBedrock(schema) {
  if (!schema || typeof schema !== "object") return schema;

  const adapted = { ...schema };

  delete adapted.$schema;
  delete adapted.name;
  delete adapted.description;

  if (adapted.type === "object" && adapted.properties) {
    adapted.additionalProperties = false;
    adapted.required = Object.keys(adapted.properties);

    for (const [key, value] of Object.entries(adapted.properties)) {
      adapted.properties[key] = adaptSchemaForBedrock(value);
    }
  }

  if (adapted.type === "array" && adapted.items) {
    adapted.items = adaptSchemaForBedrock(adapted.items);
  }

  return adapted;
}

/**
 * Build the outputConfig object for Bedrock ConverseCommand
 */
export function buildOutputConfig(schema) {
  const adapted = adaptSchemaForBedrock(schema);
  const { description: _desc, ...schemaForBedrock } = adapted;

  return {
    textFormat: {
      type: "json_schema",
      structure: {
        jsonSchema: {
          name: "consent_extraction",
          schema: JSON.stringify(schemaForBedrock),
          description: _desc || "Extracted template variables for NIH consent form generation",
        },
      },
    },
  };
}

/**
 * Build a sub-schema containing only the specified fields from the full schema.
 */
export function buildSubSchema(fullSchema, fields) {
  const sub = {
    type: "object",
    properties: {},
    required: fields,
    additionalProperties: false,
  };
  for (const field of fields) {
    if (fullSchema.properties[field]) {
      sub.properties[field] = fullSchema.properties[field];
    }
  }
  return sub;
}

/**
 * Build chunked sub-schemas from the full schema using SCHEMA_CHUNKS definitions.
 * Returns an array of { name, label, subSchema } objects.
 */
export function buildChunkedSchemas(fullSchema) {
  return SCHEMA_CHUNKS.map((chunk) => ({
    name: chunk.name,
    label: chunk.label,
    subSchema: buildSubSchema(fullSchema, chunk.fields),
  }));
}
