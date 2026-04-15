import {
  buildContradictionReviewInput,
  normalizeContradictionReviewPayload,
} from "../shared/contradiction-helpers.js";

import { createStructuredReviewExecutor } from "./structured-review.js";

export const executeConsentConsistencyReview = createStructuredReviewExecutor({
  serviceError: "protocol_advisor requires a gateway service for consent consistency review",
  systemPromptKey: "consentContradictionReviewSystem",
  userPromptKey: "consentContradictionReviewUser",
  gatewayType: "workflow-protocol_advisor-consent_consistency_review",
  buildInput: (ctx) => buildContradictionReviewInput(ctx.steps.parseConsent),
  buildUserInput: (input) => ({
    consent: input.document,
    sections: input.sections,
  }),
  outputExample: {
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
        explanation: "The consent gives conflicting instructions about eating before the visit.",
        resolutionGuidance: "Reconcile the pre-visit eating instructions in Sections 4 and 8.",
      },
    ],
    citations: [],
  },
  normalize: normalizeContradictionReviewPayload,
  emptySummary: "No consent inconsistencies identified.",
});

export default executeConsentConsistencyReview;
