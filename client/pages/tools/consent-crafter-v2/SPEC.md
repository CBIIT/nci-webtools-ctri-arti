# Consent Crafter v2 Specification

## Overview

Consent Crafter v2 generates informed consent documents from clinical trial protocols using a **2-chunk field extraction pipeline**. The system extracts 78 structured JSON fields from a protocol document, then fills a DOCX template using `docx-templates`.

Key design decisions:
- **2-chunk extraction** with Bedrock system prompt caching (40-90% token savings on chunk 2)
- **No pre-extraction phase** — schema + consent library + protocol all go in one cached system prompt
- **Field-based JSON output** — model returns structured fields, not block-level actions
- **Consent library verbatim usage** — IRB-approved procedure/risk language used word-for-word

## Testing

### Integration Test (Primary Validation Method)

The consent crafter v2 integration test runs the **full pipeline end-to-end** in a real Chromium browser via Playwright, making real Bedrock API calls against the sample Atezolizumab TDM protocol.

**Run it:**
```bash
cd server && npm run test:integration
```

**Runtime:** 5-10 minutes (dominated by two Bedrock API calls). Subsequent runs benefit from Bedrock's system prompt cache (~90% cache hit on chunk 2).

**What it does:**
1. Starts the Express server on port 8080
2. Launches headless Chromium via Playwright
3. Navigates to `http://localhost:8080/?test=1`
4. Loads all resources (protocol, consent library, prompt, schema, DOCX template)
5. Analyzes the DOCX template structure (discovers `{{variables}}`)
6. Runs 2-chunk field extraction via real Bedrock API calls
7. Validates all 78 required schema fields are present and correctly typed
8. Generates a filled DOCX via `docx-templates`
9. Extracts text from the generated DOCX and logs it to console
10. Compares section presence against the reference consent output

### Test Architecture

```
npm run test:integration
  |
  server/integration.js
  |  - Creates Express server from server.js
  |  - Launches headless Chromium via Playwright
  |  - Navigates to http://localhost:8080/?test=1&apiKey=...
  |  - Pipes all console.log from browser to Node.js stdout (TAP format)
  |  - Waits for window.TESTS_DONE === true (60 min timeout)
  |
  client/pages/index.js
  |  - Renders normal SolidJS app
  |  - Detects ?test=1 param on localhost
  |  - Dynamically imports client/test/run.js
  |
  client/test/run.js (test manifest)
  |  - Imports test files from explicit list (including consent-crafter-v2)
  |  - Calls await run() from custom TAP v13 framework
  |
  client/test/pages/tools/consent-crafter-v2/index.test.js
     - Fetches resources from server (same URLs the real app uses)
     - Calls runFieldExtraction() from extract.js
     - Calls /api/model endpoint for real Bedrock inference
     - Generates DOCX via docx-templates (same as processJob)
     - Logs full JSON extraction + DOCX text to console
     - Runs assertions on field presence, types, and values
```

### Test Environment

Configuration in `server/test.env`:
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — Bedrock credentials
- `TEST_API_KEY` — passed to browser via URL param, sent as `x-api-key` header
- `DB_DIALECT=sqlite` — uses SQLite instead of PostgreSQL
- `CLIENT_FOLDER=../client` — serves client assets

### What the Test Validates

| Check | Details |
|-------|---------|
| All 78 required fields present | Every field in `consent-schema.json` required array |
| Non-empty strings | pi_name, study_title, study_site, cohort, contact_*, key_info_*, study_purpose, study_procedures_intro, risks_intro, benefits_description, disease_condition |
| Boolean types | parent_permission, is_investigational, coi_*, genomic_*, payment booleans |
| Drug risks structure | Array of objects with drug_name, common/occasional/rare definitions and risks arrays |
| Procedure risks | Array of non-empty strings, "Heading: risk text..." format |
| Protocol-specific values | pi_name contains "Gulley", study_duration includes "2 year", accrual_ceiling is numeric |
| Consent library fidelity | procedure_risks mentions "blood draw", "needle", "CT", "ECG" |
| DOCX generation | Template fills without error, produces valid DOCX |
| Template variable coverage | Logs which template vars are missing/empty |
| Reference comparison | Compares section headings against reference consent output |

### Debugging Missing Fields

When the DOCX output has empty sections, trace the field name through the full chain:

1. **Schema** (`client/templates/nih-cc/consent-schema.json`): Is the field in `properties` and `required`?
2. **Extract chunks** (`client/pages/tools/consent-crafter-v2/extract.js`): Is the field in `SCHEMA_CHUNKS`? Does the name **match the schema exactly**?
3. **Prompt** (`client/templates/nih-cc/prompt-v3.txt`): Does the prompt reference this field by name?
4. **DOCX template** (`client/templates/nih-cc/template-v14-final.docx`): Does the template use `{{field_name}}`, `{{#if field_name}}`, or `{{#for field_name}}`?

Common failure mode: extract.js chunk requests `foo` but schema defines `bar` — model returns `foo` in JSON, template expects `bar`, `listCommands` sets `bar` to empty default.

### Analyzing Template Commands

Use `scripts/consent-crafter-v2/check-template-commands.mjs` to dump all `{{}}` commands from a DOCX template:

```bash
cd scripts/consent-crafter-v2
node check-template-commands.mjs                                    # client template
node check-template-commands.mjs inputs/template-v14-final.docx     # scripts template
```

### Reference Files

| File | Purpose |
|------|---------|
| `client/templates/nih-cc/protocol.txt` | Sample Atezolizumab TDM protocol (238K chars) |
| `client/templates/nih-cc/consent-library.txt` | IRB-approved procedure/risk language (102K chars) |
| `client/templates/nih-cc/prompt-v3.txt` | System prompt template with ${placeholders} |
| `client/templates/nih-cc/consent-schema.json` | 78-field JSON schema with descriptions |
| `client/templates/nih-cc/template-v14-final.docx` | DOCX template with `{{variables}}` |
| `client/templates/nih-cc/IRB001559_Consent_clean_20231017_NoHeadersFooters.txt` | Reference consent output (slightly different older protocol; used for section structure comparison) |

## Pipeline Architecture

### Data Flow

```
Protocol (PDF/DOCX/TXT)
  |
  parseDocument() -> plain text
  |
  +-- System Prompt Assembly --------+
  |   promptTemplate (prompt-v3.txt)  |
  |   + consentLibrary (102K chars)   |
  |   + schema JSON (78 fields)       |  -> ~550K chars total
  |   + templateAnalysis              |     (cached by Bedrock after chunk 1)
  |   + fieldDescriptions             |
  |   + protocol text (238K chars)    |
  +----------------------------------+
  |
  Chunk 1: "Extract ONLY these fields: pi_name, study_title, ..."
    -> Model returns JSON with 38 fields (incl. references, reasoning)
    -> cache_write ~104K tokens
  |
  Chunk 2: "Extract ONLY these fields: risks_intro, drug_risks, ..."
    -> Model returns JSON with 42 fields (incl. references, reasoning)
    -> cache_read ~104K tokens (90% savings!)
  |
  Merge: concatenate references/reasoning arrays, overwrite all other fields
  |
  Set defaults: listCommands() discovers template {{variables}},
                fills missing with "" / false / []
  |
  createReport(): docx-templates fills the DOCX
  |
  Download: user gets completed consent DOCX
```

### Extraction Chunks (extract.js)

**Chunk 1 — Study identity & procedures** (38 fields):
references, reasoning, pi_name, study_title, study_site, cohort, consent_version, contact_name, contact_phone, contact_email, other_contact_name, other_contact_phone, other_contact_email, key_info_why_asked, key_info_purpose, key_info_fda_status, key_info_phase, key_info_phase_explanation, key_info_happenings, key_info_benefits, key_info_risks, key_info_alternatives, key_info_voluntariness, parent_permission, impaired_adults, study_purpose, why_you_asked, is_investigational, approach_investigational_drug_name, investigational_condition, is_fda_approved_off_label, fda_approved_indication, research_testing_reason, study_procedures_intro, study_procedures, study_duration, accrual_ceiling, multisite_count

**Chunk 2 — Risks, benefits, alternatives & COI** (42 fields):
references, reasoning, risks_intro, drug_risks, procedure_risks, pregnancy_risks, radiation_risks, has_potential_benefits, no_potential_benefits, benefits_description, benefits_others_reason, alternatives_list, alternatives_advice, return_of_results, early_withdrawal, disease_condition, is_open_repository, is_closed_repository, genomic_non_sensitive, genomic_sensitive, may_anonymize, will_not_anonymize, specimen_storage_duration, no_payment, has_payment, payment_details, partial_payment_details, reimbursement_info, cost_additional, coi_no_agreements, coi_tech_license, coi_product_description, coi_product_name, coi_crada, coi_cta, coi_company_name, coi_product_provision, coi_through_program, coi_program_name, sponsor_name, manufacturer_name, product_name

**Critical:** Field names in SCHEMA_CHUNKS must match the schema's `properties` keys exactly. A mismatch causes the model to return the value under the wrong key name, which the template can't use.

### System Prompt Assembly (buildSystemPrompt)

The prompt template (`prompt-v3.txt`) uses `${placeholder}` syntax filled at runtime:

```javascript
promptTemplate
  .replaceAll("${consentLibrary}", consentLibrary)
  .replaceAll("${protocol}", protocolText)
  .replaceAll("${today}", todayStr)
  .replaceAll("${schema}", schemaJson)
  .replaceAll("${templateAnalysis}", templateAnalysis)
  .replaceAll("${fieldDescriptions}", fieldDescriptions)
```

Prompt sections:
1. Writing style — Grade 6 reading level, active voice, "you/your"
2. Cohort awareness — Affected patient vs healthy volunteer vs donor
3. Study procedures guidance — Use consent library verbatim, organize by phase
4. Risks intro — Required IRB disclosure topics
5. Drug side effects style — Grouped by frequency, immune-system framing
6. Procedure risks style — Short heading + risks on same line
7. Section completeness — Field-by-field guidance for commonly mishandled fields

### DOCX Template Filling

```javascript
const { createReport, listCommands } = await import("docx-templates");

// Discover template variables
const commands = await listCommands(templateBuffer, ["{{", "}}"]);

// Set defaults for any extraction gaps
for (const variable of variables) {
  if (data[variable.name] == null) {
    data[variable.name] = variable.type === "array" ? []
      : variable.type === "boolean" ? false : "";
  }
}

// Generate filled DOCX
const buffer = await createReport({
  template: templateBuffer,
  data,
  cmdDelimiter: ["{{", "}}"],
  processLineBreaks: true,
});
```

The template supports full JS expressions in `{{}}` delimiters (e.g., `{{#if !(impaired_adults || parent_permission)}}`). The `listCommands` variable parser uses simple heuristics and may not parse complex expressions perfectly — this is expected.

### Template Variable Types

| Type | Delimiter | Example | Schema Type |
|------|-----------|---------|-------------|
| INS (insert) | `{{field_name}}` | `{{pi_name}}` | string |
| FOR (loop) | `{{#for item IN field}}...{{/for}}` | `{{#for drug IN drug_risks}}` | array |
| IF (conditional) | `{{#if field}}...{{/if}}` | `{{#if is_investigational}}` | boolean |

## Schema (consent-schema.json)

78 required fields organized by section:

| Category | Key Fields | Count |
|----------|-----------|-------|
| Identity & Contact | pi_name, study_title, study_site, cohort, consent_version, contact_*, other_contact_* | 12 |
| Key Information | key_info_why_asked, key_info_purpose, key_info_fda_status, key_info_phase, key_info_phase_explanation, key_info_happenings, key_info_benefits, key_info_risks, key_info_alternatives, key_info_voluntariness | 10 |
| Study Details | parent_permission, impaired_adults, study_purpose, why_you_asked, is_investigational, approach_investigational_drug_name, investigational_condition, is_fda_approved_off_label, fda_approved_indication, research_testing_reason, study_procedures_intro, study_procedures, study_duration, accrual_ceiling, multisite_count | 15 |
| Risks | risks_intro, drug_risks, procedure_risks, pregnancy_risks, radiation_risks | 5 |
| Benefits & Alternatives | has_potential_benefits, no_potential_benefits, benefits_description, benefits_others_reason, alternatives_list, alternatives_advice | 6 |
| Data & Specimens | return_of_results, early_withdrawal, disease_condition, is_open_repository, is_closed_repository, genomic_*, may_anonymize, will_not_anonymize, specimen_storage_duration | 10 |
| Payment | no_payment, has_payment, payment_details, partial_payment_details, reimbursement_info, cost_additional | 6 |
| Conflict of Interest | coi_no_agreements, coi_tech_license, coi_product_description, coi_product_name, coi_crada, coi_cta, coi_company_name, coi_product_provision, coi_through_program, coi_program_name, sponsor_name, manufacturer_name, product_name | 13 |
| Meta | references, reasoning | 2 |

### Notable Field Structures

**drug_risks** (array of objects):
```json
[{
  "drug_name": "Atezolizumab",
  "common_definition": "These side effects happen in more than 20 out of 100 people.",
  "common_risks": ["Feeling very tired (fatigue)", "Infection"],
  "occasional_definition": "...",
  "occasional_risks": ["..."],
  "rare_definition": "...",
  "rare_risks": ["..."]
}]
```

**study_procedures** (array of objects — procedure title + description):
```json
[
  { "title": "Blood Draws", "description": "We will draw about 50 ml of blood..." },
  { "title": "Physical Exam", "description": "A doctor will check your heart, lungs..." },
  { "title": "CT Scan", "description": "You will lie on a table that slides into..." }
]
```

**procedure_risks** (array of strings — heading + risks on same line):
```json
[
  "Blood Draws: Blood draws may cause pain, redness, bruising, or infection...",
  "CT Scan: See radiation risks section below. You may also receive contrast..."
]
```

### Fields Not in Template

Some schema fields are metadata only — extracted for logging/debugging but not rendered in the DOCX:
- `references` — verbatim protocol quotes supporting each extraction
- `reasoning` — decision explanations for each field
- `key_info_phase` — removed from client template (phase info folded into `key_info_phase_explanation`)
- `other_contact_email` — not in template (only name and phone shown)

## Client-Side Implementation

### Key Files

| File | Purpose |
|------|---------|
| `index.js` | Page component, state management, job orchestration, DOCX generation |
| `extract.js` | 2-chunk extraction logic, system prompt assembly, JSON parsing |
| `config.js` | Template configurations (URLs, labels, categories) |

### State (SolidJS store)

```javascript
{
  id: null,                    // IndexedDB session ID
  inputFile: null,             // Protocol File blob
  selectedTemplates: [],       // Checkbox-selected template IDs
  model: "us.anthropic.claude-opus-4-6-v1",
  generatedDocuments: {        // Keyed by jobId (UUID)
    [jobId]: { status, blob, data, error, config, stats }
  },
  templateCache: {},           // Fetched DOCX Files by template ID
  libraryCache: {},            // Fetched library text by URL
  promptCache: {},             // Fetched prompt text by URL
  schemaCache: {},             // Fetched schema JSON by URL
  extractionProgress: { status, completed, total, message },
}
```

### Session Persistence

- **Database**: IndexedDB (`consent-crafter-v2-{email}`)
- **Object store**: `sessions` (keyPath: `id`, autoIncrement)
- **URL integration**: Session ID in `?id=X` param for bookmarking
- **Auto-retry**: Interrupted jobs (status="processing") auto-retry on page load

### Dependencies

- **SolidJS** — reactive UI (CDN, no build)
- **idb** — IndexedDB wrapper for session persistence
- **docx-templates** — DOCX template filling with `{{variables}}`
- **docxExtractTextBlocks** — custom DOCX text extraction utility
- **parseDocument** — protocol text extraction (PDF/DOCX/TXT)
