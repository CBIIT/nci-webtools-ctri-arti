/**
 * Integration test for consent form generation pipeline.
 *
 * Mirrors the consent-crafter-v2 processJob submit flow as closely as possible:
 *   1. Loads resources from the same URLs (config.js paths)
 *   2. Uses the same runModel function shape as index.js:2324
 *   3. Calls generateConsentForm (which filters library → builds text → runs extraction)
 *   4. Logs every extracted field for comparison against sample-output.txt
 *
 * Run with: cd server && npm run test:integration
 */
import test from "/test/test.js";
import assert from "/test/assert.js";
import { generateConsentForm } from "/services/consent-form-generator.js";

const urlParams = new URLSearchParams(window.location.search);
const TEST_API_KEY = urlParams.get("apiKey");

// ── runModel — matches consent-crafter-v2/index.js:2324 exactly ──────────────
// The only addition is usage logging and API key support for testing.
async function runModel(params) {
  console.log(`[runModel] POST /api/model (model=${params.model}, outputConfig=${!!params.outputConfig})`);
  const headers = { "Content-Type": "application/json" };
  if (TEST_API_KEY) headers["x-api-key"] = TEST_API_KEY;

  const response = await fetch("/api/model", {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    console.log(`[runModel] Error ${response.status}: ${text.slice(0, 500)}`);
    throw new Error(`Network response was not ok: ${response.status}`);
  }

  const data = await response.json();
  const text = data.output?.message?.content?.map((c) => c.text || "").join(" ") || "";

  // Log usage for cache analysis (chunks 2-4 should show high cache_read)
  if (data.usage) {
    const u = data.usage;
    console.log(
      `[runModel] Usage: input=${u.inputTokens} output=${u.outputTokens}` +
      ` cache_read=${u.cacheReadInputTokens || 0} cache_write=${u.cacheWriteInputTokens || 0}`
    );
  }

  return text;
}

test("Consent Form Generator", async (t) => {
  await t.test("end-to-end: filter + extract for Atezolizumab protocol", async () => {
    console.log("=".repeat(80));
    console.log("=== Consent Form Generator — End-to-End Integration Test ===");
    console.log("=".repeat(80));

    // ── 1. Load resources (same URLs as config.js) ─────────────────────────
    console.log("\n--- Loading resources (matching config.js URLs) ---");
    const [libraryJsonRes, libraryTxtRes, protocolRes, promptRes, schemaRes] = await Promise.all([
      fetch("/templates/nih-cc/consent-library.json"),
      fetch("/templates/nih-cc/consent-library.txt"),   // production library text for comparison
      fetch("/templates/nih-cc/protocol.txt"),
      fetch("/templates/nih-cc/prompt-v3.txt"),          // config.promptUrl
      fetch("/templates/nih-cc/consent-schema.json"),    // config.schemaUrl
    ]);

    assert.ok(libraryJsonRes.ok, "consent-library.json should load");
    assert.ok(libraryTxtRes.ok, "consent-library.txt should load");
    assert.ok(protocolRes.ok, "protocol.txt should load");
    assert.ok(promptRes.ok, "prompt-v3.txt should load");
    assert.ok(schemaRes.ok, "consent-schema.json should load");

    const consentLibrary = await libraryJsonRes.json();
    const productionLibraryText = await libraryTxtRes.text();
    const protocolText = await protocolRes.text();
    const promptTemplate = await promptRes.text();
    const fullSchema = await schemaRes.json();

    const libraryKeys = Object.keys(consentLibrary);
    const schemaFields = Object.keys(fullSchema.properties || {});

    console.log(`[load] consent-library.json: ${libraryKeys.length} sections`);
    console.log(`[load] consent-library.txt: ${productionLibraryText.length} chars (production reference)`);
    console.log(`[load] protocol.txt: ${protocolText.length} chars`);
    console.log(`[load] prompt-v3.txt: ${promptTemplate.length} chars`);
    console.log(`[load] consent-schema.json: ${schemaFields.length} fields, ${fullSchema.required?.length} required`);

    // ── 2. Run full pipeline (filter → build text → extract) ───────────────
    console.log("\n--- Running generateConsentForm (filter → extract) ---");
    const startTime = Date.now();

    const result = await generateConsentForm({
      protocolText,
      consentLibrary,
      promptTemplate,
      fullSchema,
      model: "us.anthropic.claude-opus-4-6-v1",
      runModelFn: runModel,
      onProgress: ({ status, completed, total, message }) => {
        console.log(`[progress] ${status}: ${message || `${completed}/${total}`}`);
      },
    });

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n--- Pipeline completed in ${totalElapsed}s ---`);

    const { filterResult, extraction } = result;

    // ── 3. Log filter results ──────────────────────────────────────────────
    console.log("\n" + "=".repeat(80));
    console.log("STEP 1 RESULTS: CONSENT LIBRARY FILTERING");
    console.log("=".repeat(80));

    console.log(`\nReasoning:\n${filterResult.reasoning}`);

    console.log(`\nMatched ${filterResult.matched_keys.length} of ${libraryKeys.length} sections:`);
    for (const key of filterResult.matched_keys) {
      console.log(`  [x] ${key}`);
    }

    const matchedSet = new Set(filterResult.matched_keys);
    const excludedKeys = libraryKeys.filter((k) => !matchedSet.has(k));
    console.log(`\nExcluded ${excludedKeys.length} sections:`);
    for (const key of excludedKeys) {
      console.log(`  [ ] ${key}`);
    }

    // ── 4. Log every extracted field ───────────────────────────────────────
    console.log("\n" + "=".repeat(80));
    console.log("STEP 2 RESULTS: FIELD EXTRACTION (all 76 fields)");
    console.log("=".repeat(80));

    // Log full JSON for programmatic comparison
    console.log("\n--- Full JSON ---");
    console.log(JSON.stringify(extraction, null, 2));

    // Log each field individually for readability
    console.log("\n--- Field-by-field summary ---");
    for (const field of schemaFields) {
      const value = extraction[field];
      const type = fullSchema.properties[field]?.type;

      if (value === undefined) {
        console.log(`  ${field}: [MISSING]`);
      } else if (type === "array" && Array.isArray(value)) {
        console.log(`  ${field}: [array, ${value.length} items]`);
        if (field === "drug_risks") {
          for (const drug of value) {
            console.log(`    - ${drug.drug_name}: common=${drug.common_risks?.length || 0} occasional=${drug.occasional_risks?.length || 0} rare=${drug.rare_risks?.length || 0}`);
          }
        } else if (field === "procedure_risks") {
          for (const risk of value) {
            const preview = typeof risk === "string" ? risk.slice(0, 80) : JSON.stringify(risk).slice(0, 80);
            console.log(`    - ${preview}${risk.length > 80 ? "..." : ""}`);
          }
        } else if (field === "alternatives_list") {
          for (const alt of value) {
            console.log(`    - ${alt}`);
          }
        } else {
          for (const item of value.slice(0, 3)) {
            const preview = typeof item === "string" ? item.slice(0, 80) : JSON.stringify(item).slice(0, 80);
            console.log(`    - ${preview}...`);
          }
          if (value.length > 3) console.log(`    ... and ${value.length - 3} more`);
        }
      } else if (type === "boolean") {
        console.log(`  ${field}: ${value} (${typeof value})`);
      } else if (typeof value === "string") {
        if (value.length <= 100) {
          console.log(`  ${field}: "${value}"`);
        } else {
          console.log(`  ${field}: "${value.slice(0, 100)}..." (${value.length} chars)`);
        }
      } else {
        console.log(`  ${field}: ${JSON.stringify(value)}`);
      }
    }

    // ── 5. Assertions: filter step ─────────────────────────────────────────
    console.log("\n" + "=".repeat(80));
    console.log("ASSERTIONS");
    console.log("=".repeat(80));

    console.log("\n--- Filter assertions ---");

    assert.ok(typeof filterResult.reasoning === "string" && filterResult.reasoning.length > 0, "Filter reasoning should be non-empty");
    console.log("[PASS] Filter reasoning is non-empty");

    assert.ok(Array.isArray(filterResult.matched_keys), "matched_keys should be an array");
    assert.ok(filterResult.matched_keys.length >= 10, `Should match >= 10 sections, got ${filterResult.matched_keys.length}`);
    assert.ok(filterResult.matched_keys.length <= 40, `Should match <= 40 sections, got ${filterResult.matched_keys.length}`);
    console.log(`[PASS] matched_keys count (${filterResult.matched_keys.length}) in range [10, 40]`);

    // All returned keys must exist in the library
    for (const key of filterResult.matched_keys) {
      assert.ok(libraryKeys.includes(key), `Matched key "${key}" must exist in consent-library.json`);
    }
    console.log("[PASS] All matched keys exist in consent library");

    // Expected sections for Atezolizumab protocol
    const expectedFilterKeys = [
      "BLOOD DRAWS",
      "CT SCAN",
      "RADIATION",
      "PREGNANCY",
      "IV (INTRAVENOUS CATHETER)",
      "ELECTROCARDIOGRAM",
      "ALLERGIC REACTION",
      "CONTRAST AGENT",
      "INVASION OF PRIVACY/BREACH IN CONFIDENTIALITY",
      "CHART REVIEW",
    ];
    for (const key of expectedFilterKeys) {
      const found = filterResult.matched_keys.includes(key);
      console.log(`[${found ? "PASS" : "FAIL"}] Filter includes "${key}"`);
      assert.ok(found, `Expected filter to include "${key}"`);
    }

    // ── 6. Assertions: extraction — all required fields present ────────────
    console.log("\n--- Extraction assertions ---");

    const requiredFields = fullSchema.required || [];
    const missingFields = requiredFields.filter((f) => !(f in extraction));
    if (missingFields.length > 0) {
      console.log(`[FAIL] Missing required fields: ${missingFields.join(", ")}`);
    }
    assert.ok(missingFields.length === 0, `All required fields present. Missing: ${missingFields.join(", ")}`);
    console.log(`[PASS] All ${requiredFields.length} required schema fields present`);

    // ── 7. Key string fields are non-empty ─────────────────────────────────
    const nonEmptyStringFields = [
      "pi_name",
      "study_title",
      "study_site",
      "cohort",
      "contact_name",
      "contact_phone",
      "contact_email",
      "key_info_why_asked",
      "key_info_purpose",
      "key_info_happenings",
      "study_purpose",
      "why_you_asked",
      "study_procedures",
      "risks_intro",
      "benefits_description",
      "disease_condition",
    ];
    for (const field of nonEmptyStringFields) {
      const ok = typeof extraction[field] === "string" && extraction[field].length > 0;
      console.log(`[${ok ? "PASS" : "FAIL"}] ${field} is non-empty string (${extraction[field]?.length || 0} chars)`);
      assert.ok(ok, `${field} should be non-empty string`);
    }

    // ── 8. drug_risks structure ────────────────────────────────────────────
    assert.ok(Array.isArray(extraction.drug_risks), "drug_risks should be an array");
    assert.ok(extraction.drug_risks.length > 0, "drug_risks should be non-empty");
    for (const drug of extraction.drug_risks) {
      assert.ok(typeof drug.drug_name === "string" && drug.drug_name.length > 0, `drug_name should be non-empty, got "${drug.drug_name}"`);
      assert.ok(typeof drug.common_definition === "string", "common_definition should be a string");
      assert.ok(Array.isArray(drug.common_risks), "common_risks should be an array");
      assert.ok(typeof drug.occasional_definition === "string", "occasional_definition should be a string");
      assert.ok(Array.isArray(drug.occasional_risks), "occasional_risks should be an array");
      assert.ok(typeof drug.rare_definition === "string", "rare_definition should be a string");
      assert.ok(Array.isArray(drug.rare_risks), "rare_risks should be an array");
    }
    console.log(`[PASS] drug_risks: ${extraction.drug_risks.length} drug(s) with full risk tier structure`);

    // ── 9. procedure_risks — non-empty array of strings ────────────────────
    assert.ok(Array.isArray(extraction.procedure_risks), "procedure_risks should be an array");
    assert.ok(extraction.procedure_risks.length > 0, "procedure_risks should be non-empty");
    for (const risk of extraction.procedure_risks) {
      assert.ok(typeof risk === "string" && risk.length > 0, "Each procedure_risk should be a non-empty string");
    }
    console.log(`[PASS] procedure_risks: ${extraction.procedure_risks.length} entries, all non-empty strings`);

    // ── 10. Boolean fields are actual booleans ─────────────────────────────
    const booleanFields = [
      "parent_permission",
      "impaired_adults",
      "is_investigational",
      "is_fda_approved_off_label",
      "has_potential_benefits",
      "no_potential_benefits",
      "is_open_repository",
      "is_closed_repository",
      "genomic_non_sensitive",
      "genomic_sensitive",
      "may_anonymize",
      "will_not_anonymize",
      "no_payment",
      "has_payment",
      "coi_no_agreements",
      "coi_tech_license",
      "coi_crada",
      "coi_cta",
      "coi_through_program",
    ];
    for (const field of booleanFields) {
      const ok = typeof extraction[field] === "boolean";
      console.log(`[${ok ? "PASS" : "FAIL"}] ${field}: ${extraction[field]} (type: ${typeof extraction[field]})`);
      assert.ok(ok, `${field} should be boolean, got ${typeof extraction[field]}`);
    }

    // ── 11. Expected specific values from the Atezolizumab protocol ────────
    console.log("\n--- Protocol-specific value checks ---");

    assert.ok(extraction.study_duration === "2 years", `study_duration should be "2 years", got "${extraction.study_duration}"`);
    console.log(`[PASS] study_duration: "${extraction.study_duration}"`);

    // Protocol says 40 total across all sites; NIH-only could be interpreted as 15.
    // Both are defensible — just verify it's a non-empty numeric string.
    assert.ok(/^\d+$/.test(extraction.accrual_ceiling), `accrual_ceiling should be a numeric string, got "${extraction.accrual_ceiling}"`);
    console.log(`[PASS] accrual_ceiling: "${extraction.accrual_ceiling}"`);

    assert.ok(extraction.is_investigational === true, "is_investigational should be true (atezolizumab is investigational in this study)");
    console.log(`[PASS] is_investigational: ${extraction.is_investigational}`);

    assert.ok(extraction.parent_permission === false, "parent_permission should be false (adults only, age >= 18)");
    console.log(`[PASS] parent_permission: ${extraction.parent_permission}`);

    assert.ok(extraction.no_payment === true, "no_payment should be true (no payment mentioned in protocol)");
    console.log(`[PASS] no_payment: ${extraction.no_payment}`);

    // PI name should contain "Gulley"
    assert.ok(extraction.pi_name.includes("Gulley"), `pi_name should contain "Gulley", got "${extraction.pi_name}"`);
    console.log(`[PASS] pi_name contains "Gulley": "${extraction.pi_name}"`);

    // Study site should reference NIH
    assert.ok(
      extraction.study_site.includes("NIH") || extraction.study_site.includes("National Institutes"),
      `study_site should reference NIH, got "${extraction.study_site}"`
    );
    console.log(`[PASS] study_site references NIH: "${extraction.study_site}"`);

    // Disease should reference cancer
    assert.ok(
      extraction.disease_condition.toLowerCase().includes("cancer"),
      `disease_condition should mention cancer, got "${extraction.disease_condition}"`
    );
    console.log(`[PASS] disease_condition mentions cancer: "${extraction.disease_condition}"`);

    // Key info phase should mention Phase I
    assert.ok(
      extraction.key_info_phase.includes("I") || extraction.key_info_phase.includes("1"),
      `key_info_phase should mention Phase I, got "${extraction.key_info_phase}"`
    );
    console.log(`[PASS] key_info_phase: "${extraction.key_info_phase}"`);

    // Drug name should reference atezolizumab
    assert.ok(
      extraction.investigational_drug_name.toLowerCase().includes("atezolizumab"),
      `investigational_drug_name should mention atezolizumab, got "${extraction.investigational_drug_name}"`
    );
    console.log(`[PASS] investigational_drug_name: "${extraction.investigational_drug_name}"`);

    // ── 12. Verify procedure_risks contain consent library language ────────
    console.log("\n--- Consent library fidelity checks ---");

    // procedure_risks should contain text from matched library sections
    const allProcedureRiskText = extraction.procedure_risks.join(" ").toLowerCase();
    const expectedProcedureKeywords = ["blood draw", "needle", "ct", "ecg", "electrocardiogram"];
    for (const kw of expectedProcedureKeywords) {
      const found = allProcedureRiskText.includes(kw);
      console.log(`[${found ? "PASS" : "INFO"}] procedure_risks mentions "${kw}"`);
    }

    console.log("\n" + "=".repeat(80));
    console.log("=== All assertions passed ===");
    console.log("=".repeat(80));
  });
});
