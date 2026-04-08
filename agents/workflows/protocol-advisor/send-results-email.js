import { createRequire } from "node:module";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const require = createRequire(import.meta.url);

async function buildProtocolAdvisorSkeletonDocx() {
  // The docx package checks globalThis.localStorage via a deprecation helper.
  // Node's test runner exposes a localStorage getter that warns unless configured,
  // so provide a harmless stub before loading the library.
  Object.defineProperty(globalThis, "localStorage", {
    value: {},
    configurable: true,
  });

  const { Document, HeadingLevel, Packer, Paragraph } = require("docx");
  const doc = new Document({
    creator: "Protocol Advisor",
    title: "Protocol Advisor Summary Report",
    description: "Protocol Advisor summary report skeleton",
    sections: [
      {
        children: [
          new Paragraph({
            text: "EXECUTIVE SUMMARY: IRB REGULATORY COMPLIANCE REVIEW",
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            text: "This review was conducted according to the standards established in 45 CFR 46.111 and related federal regulations governing human subjects research. The analysis reflects current regulatory requirements as of June 2025.",
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            text: "STUDY OVERVIEW",
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            text: "Immediate Priorities:",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({ text: "1. Regulatory Status Clarification:" }),
          new Paragraph({ text: "2. Risk Management Enhancement:" }),
          new Paragraph({ text: "3. Selection Criteria Review:" }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

function toLines(report) {
  return [
    `Protocol Advisor Results`,
    ``,
    `Workflow: ${report.workflow}`,
    `Template: ${report.template.displayName}`,
    `Status: ${report.status}`,
    ``,
    `Summary counts:`,
    ...Object.entries(report.summary.countsByStatus).map(
      ([status, count]) => `- ${status}: ${count}`
    ),
    ``,
    `Template Completeness:`,
    `- required sections: ${report.summary.templateCompleteness.requiredSectionCount}`,
    `- present sections: ${report.summary.templateCompleteness.presentSectionCount}`,
    `- missing sections: ${report.summary.templateCompleteness.missingSectionCount}`,
    ...report.summary.templateCompleteness.findings
      .slice(0, 10)
      .map(
        (finding) =>
          `- ${finding.sectionName}: ${finding.issueType} (${finding.requirementReference}) ${finding.description}`
      ),
    ``,
    `Top missing sections:`,
    ...report.summary.missingSections.map(
      (section) => `- ${section.templateSectionId || "(no id)"} ${section.templateSectionTitle}`
    ),
  ].join("\n");
}

export async function sendProtocolAdvisorResultsEmail(ctx, services) {
  const report = ctx.steps.aggregateReport;
  const requester =
    services.user ||
    (typeof services.users?.getUser === "function" && services.userId
      ? await services.users.getUser(services.userId)
      : null);
  const recipient = requester?.email || requester?.Email || null;

  if (!recipient) {
    return {
      ...report,
      delivery: {
        mode: "email",
        status: "recipient_unavailable",
        recipient: null,
      },
    };
  }

  if (typeof services.sendEmail !== "function") {
    return {
      ...report,
      delivery: {
        mode: "email",
        status: "pending_delivery",
        recipient,
      },
    };
  }

  const subject = `Protocol Advisor Results: ${report.template.displayName}`;
  const text = toLines(report);
  const docxBuffer = await buildProtocolAdvisorSkeletonDocx();
  await services.sendEmail({
    to: recipient,
    subject,
    text,
    report,
    attachments: [
      {
        filename: "protocol-advisor-summary-report.docx",
        content: docxBuffer,
        contentType: DOCX_MIME_TYPE,
      },
    ],
  });

  return {
    ...report,
    delivery: {
      mode: "email",
      status: "sent",
      recipient,
      subject,
    },
  };
}
