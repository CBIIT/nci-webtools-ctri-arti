import fs from "node:fs";

import { parseDocument } from "shared/parsers.js";

import { executeProtocolAdvisorContradictionReview } from "../workflows/protocol-advisor/execute-contradiction-review.js";
import { PROMPT_PATHS } from "../workflows/protocol-advisor/review-config.js";
import { readUtf8 } from "../workflows/protocol-advisor/review-helpers.js";

// ── 1. Configuration ────────────────────────────────────────────
const DOCX_PATH =
  "/Users/peil2/Documents/esi-work/documents/RO_documents/Protocol Documents/Example_Protocols/IRB002229_ProtocolClean_31JUL2025.docx";
const MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

// ── 2. Parse the DOCX ───────────────────────────────────────────
console.log("Parsing DOCX...");
const buffer = fs.readFileSync(DOCX_PATH);
const contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const text = (await parseDocument(buffer, contentType)).trim();
console.log(`  Extracted ${text.length} characters, ~${Math.round(text.length / 4)} tokens`);
console.log(`  First 200 chars: ${text.slice(0, 200)}...\n`);

// ── 3. Build minimal ctx (same shape the workflow provides) ─────
const ctx = {
  workflow: { runId: "live-test-" + Date.now() },
  steps: {
    loadAssets: {
      model: MODEL,
      prompts: {
        contradictionReviewSystem: readUtf8(PROMPT_PATHS.contradictionReviewSystem),
        contradictionReviewUser: readUtf8(PROMPT_PATHS.contradictionReviewUser),
      },
    },
    parseProtocol: {
      source: "document",
      contentType,
      text,
    },
  },
};

// ── 4. Build a real gateway that calls Bedrock ──────────────────
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

// ── 5. Run the contradiction review ─────────────────────────────
console.log("Running contradiction review...\n");

const result = await executeProtocolAdvisorContradictionReview(ctx, {
  gateway,
  userId: 0,
  requestId: ctx.workflow.runId,
});

// ── 6. Print results ────────────────────────────────────────────
console.log("=== RESULT ===");
console.log(`Status: ${result.status}`);
console.log(`Model: ${result.model}`);
console.log(`Document clean: ${result.output.documentClean}`);
console.log(`Summary: ${result.output.overallSummary}`);
console.log(`Findings: ${result.output.findings.length}\n`);

for (const [i, finding] of result.output.findings.entries()) {
  console.log(`--- Finding ${i + 1} [${finding.severity}] ---`);
  console.log(`Category: ${finding.category}`);
  console.log(`Concept: ${finding.concept}`);
  console.log(`Section A: ${finding.sectionA.sectionTitle} (${finding.sectionA.sectionId})`);
  console.log(`  Quote: "${finding.sectionA.quote}"`);
  console.log(`Section B: ${finding.sectionB.sectionTitle} (${finding.sectionB.sectionId})`);
  console.log(`  Quote: "${finding.sectionB.quote}"`);
  console.log(`Explanation: ${finding.explanation}`);
  console.log(`Guidance: ${finding.resolutionGuidance}\n`);
}

console.log("=== RAW OUTPUT ===");
console.log(JSON.stringify(result.output, null, 2));
