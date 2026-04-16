import {
  buildCrossDocComparisonInput,
  normalizeCrossDocReviewPayload,
} from "../shared/cross-doc-helpers.js";

import { createStructuredReviewExecutor } from "./structured-review.js";

export const executeCrossDocComparison = createStructuredReviewExecutor({
  serviceError: "protocol_advisor requires a gateway service for cross-document comparison",
  systemPromptKey: "crossDocComparisonSystem",
  userPromptKey: "crossDocComparisonUser",
  gatewayType: "workflow-protocol_advisor-cross_doc_comparison",
  buildInput: (ctx) =>
    buildCrossDocComparisonInput(ctx.steps.parseProtocol, ctx.steps.parseConsent),
  buildUserInput: (input) => ({
    protocol: input.protocol,
    protocolSections: input.protocolSections,
    consent: input.consent,
    consentSections: input.consentSections,
  }),
  outputExample: {
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
  normalize: normalizeCrossDocReviewPayload,
  emptySummary: "No cross-document discrepancies identified.",
});

export default executeCrossDocComparison;
