import { aggregateProtocolAdvisorReport } from "./aggregate-report.js";
import { extractTemplateSections } from "./extract-template-sections.js";
import { validateProtocolAdvisorInput } from "./input-schema.js";
import { loadProtocolAdvisorAssets } from "./load-assets.js";
import { matchProtocolSections } from "./match-sections.js";
import { parseProtocolDocument } from "./parse-protocol.js";
import { splitProtocolSections } from "./split-sections.js";

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
    splitSections: {
      deps: ["parseProtocol"],
      run: splitProtocolSections,
    },
    extractTemplateSections: {
      deps: ["loadAssets"],
      run: extractTemplateSections,
    },
    matchSections: {
      deps: ["extractTemplateSections", "splitSections"],
      run: matchProtocolSections,
    },
    aggregateReport: {
      deps: ["loadAssets", "parseProtocol", "splitSections", "matchSections"],
      run: aggregateProtocolAdvisorReport,
    },
  },
  output(ctx) {
    return ctx.steps.aggregateReport;
  },
};

export default protocolAdvisorWorkflow;
