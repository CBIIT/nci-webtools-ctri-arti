import fs from "node:fs";

import { parseDocument } from "shared/parsers.js";

import { executeCrossDocComparison } from "../workflows/protocol-advisor/execute-cross-doc-comparison.js";
import { PROMPT_PATHS } from "../workflows/protocol-advisor/review-config.js";
import { readUtf8 } from "../workflows/protocol-advisor/review-helpers.js";

// ── 1. Configuration ────────────────────────────────────────────
const DOCX_PATH =
  "/Users/peil2/Documents/esi-work/documents/RO_documents/Protocol Documents/Example_Protocols/IRB002229_ProtocolClean_31JUL2025.docx";
const MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

// ── 2. Parse the protocol DOCX ─────────────────────────────────
console.log("Parsing protocol DOCX...");
const buffer = fs.readFileSync(DOCX_PATH);
const contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const protocolText = (await parseDocument(buffer, contentType)).trim();
console.log(
  `  Extracted ${protocolText.length} characters, ~${Math.round(protocolText.length / 4)} tokens`
);
console.log(`  First 200 chars: ${protocolText.slice(0, 200)}...\n`);

// ── 3. Synthetic consent form (deliberate discrepancies) ────────
//    This simulates a consent form that is out of sync with the
//    protocol. The LLM should catch these cross-document issues.
const consentText = `
INFORMED CONSENT DOCUMENT

TITLE: Spectrum of Diabetes and Obesity Study

PRINCIPAL INVESTIGATOR: Dr. Smith, National Institute of Diabetes and Digestive and Kidney Diseases (NIDDK)

1 PURPOSE OF THIS STUDY

You are being asked to take part in a research study at the NIH Clinical Center. The purpose of this study is to learn more about diabetes and how it affects the body.

2 WHAT WILL HAPPEN DURING THIS STUDY

If you agree to be in this study, the following will happen:

- You will have a physical exam and blood tests.
- You will answer questions about your health and diet.
- You may be asked to wear a glucose monitor for up to 5 days.
- You will have one follow-up visit after 6 months.

3 HOW LONG WILL I BE IN THIS STUDY

Your participation in this study will last approximately 12 months, with visits every 3 months.

4 POSSIBLE RISKS

The risks of this study are small. Blood draws may cause minor bruising or discomfort at the needle site. The glucose monitor may cause mild skin irritation.

5 POSSIBLE BENEFITS

You may not benefit directly from being in this study. However, information learned from this study may help other people with diabetes in the future.

6 ALTERNATIVES TO PARTICIPATION

You may choose not to participate. Your regular medical care will not be affected.

7 COSTS AND COMPENSATION

There is no cost to you for being in this study. You will receive $50 for each completed study visit.

8 CONFIDENTIALITY

Your medical records and research information will be kept private. Your name will not appear in any published reports.

9 VOLUNTARY PARTICIPATION

Your participation is voluntary. You may leave the study at any time without penalty.

10 CONTACT INFORMATION

If you have questions, contact the study team at 301-555-0100.
`.trim();

console.log(
  `Consent text: ${consentText.length} characters, ~${Math.round(consentText.length / 4)} tokens\n`
);

// ── 4. Build minimal ctx ────────────────────────────────────────
const ctx = {
  workflow: { runId: "live-cross-doc-" + Date.now() },
  steps: {
    loadAssets: {
      model: MODEL,
      prompts: {
        crossDocComparisonSystem: readUtf8(PROMPT_PATHS.crossDocComparisonSystem),
        crossDocComparisonUser: readUtf8(PROMPT_PATHS.crossDocComparisonUser),
      },
    },
    parseProtocol: {
      source: "document",
      name: "IRB002229_ProtocolClean_31JUL2025.docx",
      contentType,
      text: protocolText,
    },
    parseConsent: {
      source: "consentText",
      name: "synthetic-consent-form.txt",
      contentType: "text/plain",
      text: consentText,
    },
  },
};

// ── 5. Build a real gateway that calls Bedrock ──────────────────
const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "us-east-1" });

const gateway = {
  invoke: async ({ model, system, messages, type }) => {
    console.log(`Calling Bedrock [${type}] with model ${model}...`);
    const startTime = Date.now();

    const command = new ConverseCommand({
      modelId: model,
      system: [{ text: system }],
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content.map((c) => ({ text: c.text })),
      })),
    });

    const response = await bedrock.send(command);
    const latencyMs = Date.now() - startTime;

    console.log(`  Done in ${latencyMs}ms`);
    console.log(`  Input tokens: ${response.usage?.inputTokens}`);
    console.log(`  Output tokens: ${response.usage?.outputTokens}\n`);

    return {
      output: { message: response.output?.message },
      usage: response.usage,
      metrics: { latencyMs },
    };
  },
};

// ── 6. Run the cross-document comparison ────────────────────────
console.log("Running cross-document comparison...\n");

const result = await executeCrossDocComparison(ctx, {
  gateway,
  userId: 0,
  requestId: ctx.workflow.runId,
});

// ── 7. Print results ────────────────────────────────────────────
console.log("=== RESULT ===");
console.log(`Status: ${result.status}`);
console.log(`Model: ${result.model}`);
console.log(`Documents aligned: ${result.output.documentsAligned}`);
console.log(`Summary: ${result.output.overallSummary}`);
console.log(`Findings: ${result.output.findings.length}\n`);

for (const [i, finding] of result.output.findings.entries()) {
  console.log(`--- Finding ${i + 1} [${finding.severity}] ---`);
  console.log(`Category: ${finding.category}`);
  console.log(`Concept: ${finding.concept}`);
  console.log(`Direction: ${finding.direction}`);
  console.log(`Likely out of sync: ${finding.likelyOutOfSync}`);
  console.log(
    `Protocol: ${finding.protocol.sectionTitle} (${finding.protocol.sectionId})${finding.protocol.page ? ` p.${finding.protocol.page}` : ""}`
  );
  console.log(`  Quote: "${finding.protocol.quote}"`);
  console.log(
    `Consent: ${finding.consent.sectionTitle} (${finding.consent.sectionId})${finding.consent.page ? ` p.${finding.consent.page}` : ""}`
  );
  console.log(`  Quote: "${finding.consent.quote}"`);
  console.log(`Explanation: ${finding.explanation}`);
  console.log(`Guidance: ${finding.resolutionGuidance}\n`);
}

console.log("=== RAW OUTPUT ===");
console.log(JSON.stringify(result.output, null, 2));
