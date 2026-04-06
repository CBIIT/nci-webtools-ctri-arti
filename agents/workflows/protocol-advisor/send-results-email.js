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
  await services.sendEmail({
    to: recipient,
    subject,
    text,
    report,
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
