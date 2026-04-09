import { aggregateProtocolAdvisorReport } from "./aggregate-report.js";
import { executeProtocolAdvisorSourceReviews } from "./execute-source-reviews.js";
import { validateProtocolAdvisorInput } from "./input-schema.js";
import { loadProtocolAdvisorAssets } from "./load-assets.js";
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
    executeSourceReviews: {
      deps: ["loadAssets", "parseProtocol"],
      run: executeProtocolAdvisorSourceReviews,
    },
    aggregateReport: {
      deps: ["loadAssets", "parseProtocol", "executeSourceReviews"],
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
