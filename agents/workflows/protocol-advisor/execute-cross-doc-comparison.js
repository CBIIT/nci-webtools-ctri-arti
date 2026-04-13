import {
  buildCrossDocComparisonInput,
  normalizeCrossDocReviewPayload,
} from "../shared/cross-doc-helpers.js";

import { invokeGatewayJson, renderTemplate } from "./review-helpers.js";

function buildSystemPrompt(assets) {
  return assets.prompts.crossDocComparisonSystem.trim();
}

function buildUserPrompt(assets, input) {
  return renderTemplate(assets.prompts.crossDocComparisonUser, {
    input_json: JSON.stringify(
      {
        protocol: input.protocol,
        protocolSections: input.protocolSections,
        consent: input.consent,
        consentSections: input.consentSections,
      },
      null,
      2
    ),
    output_json_example: JSON.stringify(
      {
        overallSummary: "Short summary of cross-document discrepancies",
        documentsAligned: false,
        findings: [
          {
            category: "risks",
            severity: "high",
            concept: "Risk of bleeding",
            direction: "consent_understates_protocol",
            likelyOutOfSync: "consent",
            protocol: {
              fileName: "protocol.pdf",
              sectionTitle: "Risks",
              sectionId: "9",
              page: 22,
              quote: "Participants may experience minor or major bleeding.",
            },
            consent: {
              fileName: "consent-form.pdf",
              sectionTitle: "Possible Risks",
              sectionId: "6",
              page: 4,
              quote: "You may have minor bruising.",
            },
            explanation:
              "The protocol describes a broader bleeding risk than the consent form discloses.",
            resolutionGuidance:
              "Reconcile the risk language so both documents describe the same risk scope.",
          },
        ],
        citations: [],
      },
      null,
      2
    ),
  }).trim();
}

export async function executeCrossDocComparison(ctx, services) {
  if (!services.gateway || typeof services.gateway.invoke !== "function") {
    throw new Error("protocol_advisor requires a gateway service for cross-document comparison");
  }

  const assets = ctx.steps.loadAssets;
  const input = buildCrossDocComparisonInput(ctx.steps.parseProtocol, ctx.steps.parseConsent);
  const { response, json } = await invokeGatewayJson({
    gateway: services.gateway,
    userId: services.userId,
    requestId: services.requestId || ctx.workflow.runId,
    model: assets.model,
    type: "workflow-protocol_advisor-cross_doc_comparison",
    system: buildSystemPrompt(assets),
    userText: buildUserPrompt(assets, input),
  });

  return {
    status: "completed",
    model: assets.model,
    input,
    output: normalizeCrossDocReviewPayload(json, {
      emptySummary: "No cross-document discrepancies identified.",
    }),
    usage: response.usage || null,
    latencyMs: response.metrics?.latencyMs ?? null,
  };
}

export default executeCrossDocComparison;
