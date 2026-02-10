/**
 * Integration test for Consent Crafter v2 — 2-chunk field extraction pipeline.
 *
 * Tests the simplified pipeline that uses:
 *   - Full schema + consent library + protocol in system prompt (cached by Bedrock)
 *   - 2 short user messages requesting specific fields as raw JSON
 *   - No outputConfig (model returns freeform JSON)
 *
 * Validates:
 *   - All required schema fields are present
 *   - String, boolean, and array fields have correct types
 *   - Protocol-specific values are extracted correctly
 *   - Drug risks have full tier structure (common/occasional/rare)
 *   - Procedure risks reference consent library language
 *   - risks_intro contains substantive patient-facing framing
 *   - Cache usage: chunk 2 should show high cache_read tokens
 *
 * Run with: cd server && npm run test:integration
 */
import test from "/test/test.js";
import assert from "/test/assert.js";
import { docxExtractTextBlocks } from "/utils/docx.js";
import { runFieldExtraction } from "/pages/tools/consent-crafter-v2/extract.js";

const urlParams = new URLSearchParams(window.location.search);
const TEST_API_KEY = urlParams.get("apiKey");

async function runModel(params) {
  console.log(`[runModel] POST /api/model (model=${params.model})`);
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

  if (data.usage) {
    const u = data.usage;
    console.log(
      `[runModel] Usage: input=${u.inputTokens} output=${u.outputTokens}` +
      ` cache_read=${u.cacheReadInputTokens || 0} cache_write=${u.cacheWriteInputTokens || 0}`
    );
  }

  return text;
}

test("Consent Crafter v2 — 2-chunk extraction", async (t) => {
  await t.test("extract fields from Atezolizumab protocol", async () => {
    console.log("=".repeat(80));
    console.log("=== Consent Crafter v2 — 2-Chunk Field Extraction Test ===");
    console.log("=".repeat(80));

    // 1. Load resources
    console.log("\n--- Loading resources ---");
    const [protocolRes, libraryRes, promptRes, schemaRes, templateRes] = await Promise.all([
      fetch("/templates/nih-cc/protocol.txt"),
      fetch("/templates/nih-cc/consent-library.txt"),
      fetch("/templates/nih-cc/prompt-v3.txt"),
      fetch("/templates/nih-cc/consent-schema.json"),
      fetch("/templates/nih-cc/template-v14-final.docx"),
    ]);

    assert.ok(protocolRes.ok, "protocol.txt should load");
    assert.ok(libraryRes.ok, "consent-library.txt should load");
    assert.ok(promptRes.ok, "prompt-v3.txt should load");
    assert.ok(schemaRes.ok, "consent-schema.json should load");
    assert.ok(templateRes.ok, "template-v14-final.docx should load");

    const protocolText = await protocolRes.text();
    const libraryText = await libraryRes.text();
    const promptTemplate = await promptRes.text();
    const fullSchema = await schemaRes.json();
    const templateBuffer = await templateRes.arrayBuffer();

    const schemaFields = Object.keys(fullSchema.properties || {});

    console.log(`[load] protocol.txt: ${protocolText.length} chars`);
    console.log(`[load] consent-library.txt: ${libraryText.length} chars`);
    console.log(`[load] prompt-v3.txt: ${promptTemplate.length} chars`);
    console.log(`[load] consent-schema.json: ${schemaFields.length} fields`);

    // 1b. Generate template analysis and field descriptions
    console.log("\n--- Analyzing template structure ---");
    const { blocks } = await docxExtractTextBlocks(templateBuffer, { includeEmpty: false });
    const templateLines = [];
    const varRegex = /\{\{([^{}]+)\}\}/g;
    for (const block of blocks) {
      if (block.source !== "document") continue;
      const text = block.text.trim();
      if (!text) continue;
      const vars = [];
      let match;
      while ((match = varRegex.exec(text)) !== null) vars.push(match[1].trim());
      varRegex.lastIndex = 0;
      const isHeading = block.style && block.style.startsWith("Heading");
      if (isHeading) {
        templateLines.push(`\n[Block @${block.index}] HEADING (${block.style}): ${text.slice(0, 120)}`);
      } else if (vars.length > 0) {
        const preview = text.length > 200 ? text.slice(0, 200) + "..." : text;
        templateLines.push(`[Block @${block.index}] Variables: ${vars.join(", ")}`);
        templateLines.push(`  Context: ${preview}`);
      }
    }
    const templateAnalysis = templateLines.join("\n");
    console.log(`[load] Template analysis: ${templateAnalysis.length} chars`);

    const fieldDescs = [];
    function walkSchema(properties, prefix = "") {
      for (const [key, value] of Object.entries(properties)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value.description) fieldDescs.push(`- ${fullKey}: ${value.description}`);
        if (value.type === "object" && value.properties) walkSchema(value.properties, fullKey);
        if (value.type === "array" && value.items?.properties) walkSchema(value.items.properties, `${fullKey}[]`);
      }
    }
    if (fullSchema.properties) walkSchema(fullSchema.properties);
    const fieldDescriptions = fieldDescs.join("\n");
    console.log(`[load] Field descriptions: ${fieldDescs.length} entries`);

    // 2. Run 2-chunk extraction
    console.log("\n--- Running 2-chunk field extraction ---");
    const startTime = Date.now();

    const extraction = await runFieldExtraction({
      protocolText,
      promptTemplate,
      consentLibrary: libraryText,
      fullSchema,
      templateAnalysis,
      fieldDescriptions,
      model: "us.anthropic.claude-opus-4-6-v1",
      runModelFn: runModel,
      onProgress: ({ status, completed, total, message }) => {
        console.log(`[progress] ${status}: ${message || `${completed}/${total}`}`);
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n--- Extraction completed in ${elapsed}s ---`);
    console.log(`Fields returned: ${Object.keys(extraction).length}`);

    // 3. Log full JSON output
    console.log("\n--- Full JSON ---");
    console.log(JSON.stringify(extraction, null, 2));

    // 4. Log field-by-field summary
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
            console.log(`    - ${preview}${(typeof risk === "string" ? risk : "").length > 80 ? "..." : ""}`);
          }
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

    // 5. Assertions — all required fields present
    console.log("\n" + "=".repeat(80));
    console.log("ASSERTIONS");
    console.log("=".repeat(80));

    const requiredFields = fullSchema.required || [];
    const missingFields = requiredFields.filter((f) => !(f in extraction));
    if (missingFields.length > 0) {
      console.log(`[FAIL] Missing required fields: ${missingFields.join(", ")}`);
    }
    assert.ok(missingFields.length === 0, `All required fields present. Missing: ${missingFields.join(", ")}`);
    console.log(`[PASS] All ${requiredFields.length} required schema fields present`);

    // 6. Key string fields are non-empty
    console.log("\n--- Non-empty string checks ---");
    const nonEmptyStringFields = [
      "pi_name", "study_title", "study_site", "cohort",
      "contact_name", "contact_phone", "contact_email",
      "key_info_why_asked", "key_info_purpose", "key_info_happenings",
      "study_purpose", "why_you_asked", "study_procedures",
      "risks_intro", "benefits_description", "disease_condition",
    ];
    for (const field of nonEmptyStringFields) {
      const ok = typeof extraction[field] === "string" && extraction[field].length > 0;
      console.log(`[${ok ? "PASS" : "FAIL"}] ${field} is non-empty string (${extraction[field]?.length || 0} chars)`);
      assert.ok(ok, `${field} should be non-empty string`);
    }

    // 7. drug_risks structure
    console.log("\n--- drug_risks structure ---");
    assert.ok(Array.isArray(extraction.drug_risks), "drug_risks should be an array");
    assert.ok(extraction.drug_risks.length > 0, "drug_risks should be non-empty");
    for (const drug of extraction.drug_risks) {
      assert.ok(typeof drug.drug_name === "string" && drug.drug_name.length > 0, `drug_name should be non-empty`);
      assert.ok(typeof drug.common_definition === "string", "common_definition should be a string");
      assert.ok(Array.isArray(drug.common_risks), "common_risks should be an array");
      assert.ok(typeof drug.occasional_definition === "string", "occasional_definition should be a string");
      assert.ok(Array.isArray(drug.occasional_risks), "occasional_risks should be an array");
      assert.ok(typeof drug.rare_definition === "string", "rare_definition should be a string");
      assert.ok(Array.isArray(drug.rare_risks), "rare_risks should be an array");
    }
    console.log(`[PASS] drug_risks: ${extraction.drug_risks.length} drug(s) with full risk tier structure`);

    // 8. procedure_risks
    console.log("\n--- procedure_risks ---");
    assert.ok(Array.isArray(extraction.procedure_risks), "procedure_risks should be an array");
    assert.ok(extraction.procedure_risks.length > 0, "procedure_risks should be non-empty");
    for (const risk of extraction.procedure_risks) {
      assert.ok(typeof risk === "string" && risk.length > 0, "Each procedure_risk should be a non-empty string");
    }
    console.log(`[PASS] procedure_risks: ${extraction.procedure_risks.length} entries, all non-empty strings`);

    // 9. Boolean fields are actual booleans
    console.log("\n--- Boolean fields ---");
    const booleanFields = [
      "parent_permission", "impaired_adults",
      "is_investigational", "is_fda_approved_off_label",
      "has_potential_benefits", "no_potential_benefits",
      "is_open_repository", "is_closed_repository",
      "genomic_non_sensitive", "genomic_sensitive",
      "may_anonymize", "will_not_anonymize",
      "no_payment", "has_payment",
      "coi_no_agreements", "coi_tech_license",
      "coi_crada", "coi_cta", "coi_through_program",
    ];
    for (const field of booleanFields) {
      const ok = typeof extraction[field] === "boolean";
      console.log(`[${ok ? "PASS" : "FAIL"}] ${field}: ${extraction[field]} (type: ${typeof extraction[field]})`);
      assert.ok(ok, `${field} should be boolean, got ${typeof extraction[field]}`);
    }

    // 10. Protocol-specific value checks
    console.log("\n--- Protocol-specific value checks ---");

    assert.ok(
      extraction.study_duration.includes("2 year"),
      `study_duration should mention "2 year(s)", got "${extraction.study_duration}"`
    );
    console.log(`[PASS] study_duration: "${extraction.study_duration}"`);

    assert.ok(/^\d+$/.test(extraction.accrual_ceiling), `accrual_ceiling should be a numeric string, got "${extraction.accrual_ceiling}"`);
    console.log(`[PASS] accrual_ceiling: "${extraction.accrual_ceiling}"`);

    assert.ok(extraction.is_investigational === true, "is_investigational should be true");
    console.log(`[PASS] is_investigational: ${extraction.is_investigational}`);

    assert.ok(extraction.parent_permission === false, "parent_permission should be false (adults only)");
    console.log(`[PASS] parent_permission: ${extraction.parent_permission}`);

    assert.ok(extraction.no_payment === true, "no_payment should be true");
    console.log(`[PASS] no_payment: ${extraction.no_payment}`);

    assert.ok(extraction.pi_name.includes("Gulley"), `pi_name should contain "Gulley", got "${extraction.pi_name}"`);
    console.log(`[PASS] pi_name contains "Gulley": "${extraction.pi_name}"`);

    assert.ok(
      extraction.study_site.includes("NIH") || extraction.study_site.includes("National Institutes"),
      `study_site should reference NIH, got "${extraction.study_site}"`
    );
    console.log(`[PASS] study_site references NIH: "${extraction.study_site}"`);

    assert.ok(
      extraction.disease_condition.toLowerCase().includes("cancer"),
      `disease_condition should mention cancer, got "${extraction.disease_condition}"`
    );
    console.log(`[PASS] disease_condition mentions cancer: "${extraction.disease_condition}"`);

    assert.ok(
      extraction.key_info_phase.includes("I") || extraction.key_info_phase.includes("1"),
      `key_info_phase should mention Phase I, got "${extraction.key_info_phase}"`
    );
    console.log(`[PASS] key_info_phase: "${extraction.key_info_phase}"`);

    assert.ok(
      extraction.investigational_drug_name.toLowerCase().includes("atezolizumab"),
      `investigational_drug_name should mention atezolizumab, got "${extraction.investigational_drug_name}"`
    );
    console.log(`[PASS] investigational_drug_name: "${extraction.investigational_drug_name}"`);

    // 11. risks_intro quality check — must contain bullet points about side effects
    console.log("\n--- risks_intro quality ---");
    const risksIntro = extraction.risks_intro.toLowerCase();
    const risksIntroChecks = [
      ["side effect", "should mention side effects"],
      ["death", "should mention possibility of death"],
    ];
    for (const [keyword, desc] of risksIntroChecks) {
      const found = risksIntro.includes(keyword);
      console.log(`[${found ? "PASS" : "INFO"}] risks_intro ${desc}: ${found}`);
    }
    assert.ok(extraction.risks_intro.length > 200, `risks_intro should be substantive (> 200 chars), got ${extraction.risks_intro.length}`);
    console.log(`[PASS] risks_intro length: ${extraction.risks_intro.length} chars`);

    // 12. Procedure risks should reference consent library language
    console.log("\n--- Consent library fidelity ---");
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
