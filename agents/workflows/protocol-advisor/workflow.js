import { aggregateProtocolAdvisorReport } from "./aggregate-report.js";
import { executeConsentConsistencyReview } from "./execute-consent-consistency-review.js";
import { executeProtocolAdvisorContradictionReview } from "./execute-contradiction-review.js";
import { executeProtocolAdvisorSourceReviews } from "./execute-source-reviews.js";
import { validateProtocolAdvisorInput } from "./input-schema.js";
import { loadProtocolAdvisorAssets } from "./load-assets.js";
import { parseConsentDocument } from "./parse-consent.js";
import { parseProtocolDocument } from "./parse-protocol.js";
import { renderProtocolAdvisorReportDocx } from "./render-report-docx.js";
import { sendProtocolAdvisorResultsEmail } from "./send-results-email.js";
import { synthesizeProtocolAdvisorFinalReport } from "./synthesize-final-report.js";

async function validateInput(ctx) {
  return validateProtocolAdvisorInput(ctx.input);
}

export const protocolAdvisorWorkflow = {
  name: "protocol_advisor",
  nodes: {
    validateInput: {
      deps: [],
      run: validateInput,
    },
    loadAssets: {
      deps: ["validateInput"],
      run: loadProtocolAdvisorAssets,
    },
    parseProtocol: {
      deps: ["validateInput"],
      run: parseProtocolDocument,
    },
    parseConsent: {
      deps: ["validateInput"],
      when(ctx) {
        const validated = ctx.steps.validateInput;
        return Boolean(
          validated?.hasConsentText ||
          validated?.hasConsentDocument ||
          validated?.hasConsentDocuments
        );
      },
      run: parseConsentDocument,
    },
    executeSourceReviews: {
      deps: ["loadAssets", "parseProtocol"],
      run: executeProtocolAdvisorSourceReviews,
    },
    executeContradictionReview: {
      deps: ["loadAssets", "parseProtocol"],
      run: executeProtocolAdvisorContradictionReview,
    },
    executeConsentConsistencyReview: {
      deps: ["loadAssets", "parseConsent"],
      when(ctx) {
        return ctx.steps.parseConsent != null;
      },
      run: executeConsentConsistencyReview,
    },
    aggregateReport: {
      deps: [
        "loadAssets",
        "parseProtocol",
        "executeSourceReviews",
        "executeContradictionReview",
        "parseConsent",
        "executeConsentConsistencyReview",
      ],
      run: aggregateProtocolAdvisorReport,
    },
    synthesizeFinalReport: {
      deps: ["loadAssets", "aggregateReport", "executeSourceReviews"],
      run: synthesizeProtocolAdvisorFinalReport,
    },
    renderReportDocx: {
      deps: ["aggregateReport", "synthesizeFinalReport"],
      run: renderProtocolAdvisorReportDocx,
    },
    sendResultsEmail: {
      deps: ["aggregateReport", "synthesizeFinalReport", "renderReportDocx"],
      run: sendProtocolAdvisorResultsEmail,
    },
  },
  output(ctx) {
    return ctx.steps.sendResultsEmail;
  },
};

export default protocolAdvisorWorkflow;
