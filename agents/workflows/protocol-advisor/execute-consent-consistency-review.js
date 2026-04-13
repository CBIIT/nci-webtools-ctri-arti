import {
  buildContradictionReviewInput,
  normalizeContradictionReviewPayload,
} from "../shared/contradiction-helpers.js";

import { invokeGatewayJson, renderTemplate } from "./review-helpers.js";

function buildSystemPrompt(assets) {
  return assets.prompts.consentContradictionReviewSystem.trim();
}

function buildUserPrompt(assets, input) {
  return renderTemplate(assets.prompts.consentContradictionReviewUser, {
    input_json: JSON.stringify(
      {
        consent: input.document,
        sections: input.sections,
      },
      null,
      2
    ),
    output_json_example: JSON.stringify(
      {
        overallSummary: "Short summary of findings",
        documentClean: false,
        findings: [
          {
            category: "participant_instructions",
            severity: "high",
            concept: "Fasting requirement",
            sectionA: {
              sectionTitle: "Before Your Visit",
              sectionId: "4",
              page: 3,
              quote: "Do not eat for 8 hours before your visit.",
            },
            sectionB: {
              sectionTitle: "Preparing for Your Appointment",
              sectionId: "8",
              page: 6,
              quote: "You may eat normally before arriving.",
            },
            explanation:
              "The consent gives conflicting instructions about eating before the visit.",
            resolutionGuidance: "Reconcile the pre-visit eating instructions in Sections 4 and 8.",
          },
        ],
        citations: [],
      },
      null,
      2
    ),
  }).trim();
}

export async function executeConsentConsistencyReview(ctx, services) {
  if (!services.gateway || typeof services.gateway.invoke !== "function") {
    throw new Error("protocol_advisor requires a gateway service for consent consistency review");
  }

  const assets = ctx.steps.loadAssets;
  const parsedConsent = ctx.steps.parseConsent;
  const input = buildContradictionReviewInput(parsedConsent);
  const { response, json } = await invokeGatewayJson({
    gateway: services.gateway,
    userId: services.userId,
    requestId: services.requestId || ctx.workflow.runId,
    model: assets.model,
    type: "workflow-protocol_advisor-consent_consistency_review",
    system: buildSystemPrompt(assets),
    userText: buildUserPrompt(assets, input),
  });

  return {
    status: "completed",
    model: assets.model,
    input,
    output: normalizeContradictionReviewPayload(json, {
      emptySummary: "No consent inconsistencies identified.",
    }),
    usage: response.usage || null,
    latencyMs: response.metrics?.latencyMs ?? null,
  };
}

export default executeConsentConsistencyReview;
