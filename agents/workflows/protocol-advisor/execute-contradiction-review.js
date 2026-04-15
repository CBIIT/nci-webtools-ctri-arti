import {
  buildContradictionReviewInput,
  normalizeContradictionReviewPayload,
} from "../shared/contradiction-helpers.js";

import { createStructuredReviewExecutor } from "./structured-review.js";

export const executeProtocolAdvisorContradictionReview = createStructuredReviewExecutor({
  serviceError: "protocol_advisor requires a gateway service for contradiction review",
  systemPromptKey: "contradictionReviewSystem",
  userPromptKey: "contradictionReviewUser",
  gatewayType: "workflow-protocol_advisor-contradiction_review",
  buildInput: (ctx) => buildContradictionReviewInput(ctx.steps.parseProtocol),
  buildUserInput: (input) => ({
    protocol: input.document,
    sections: input.sections,
  }),
  outputExample: {
    overallSummary: "Short summary of findings",
    documentClean: false,
    findings: [
      {
        category: "enrollment_sample_size",
        severity: "high",
        concept: "Target enrollment",
        sectionA: {
          sectionTitle: "Study Population",
          sectionId: "3.2",
          page: 12,
          quote: "We will enroll 40 participants.",
        },
        sectionB: {
          sectionTitle: "Statistical Considerations",
          sectionId: "10.1",
          page: 34,
          quote: "The study will enroll 60 participants.",
        },
        explanation: "Two sections describe different target enrollment totals.",
        resolutionGuidance:
          "Reconcile the target enrollment language in Section 3.2 and Section 10.1.",
      },
    ],
    citations: [],
  },
  normalize: normalizeContradictionReviewPayload,
  emptySummary: "No contradictions identified.",
});

export default executeProtocolAdvisorContradictionReview;
