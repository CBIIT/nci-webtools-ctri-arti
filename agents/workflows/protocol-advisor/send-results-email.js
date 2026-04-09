function buildEmailText(merged) {
  const lines = [];
  lines.push("Protocol Advisor review complete.");
  lines.push("");
  lines.push(`Protocol: ${merged.subject_id}`);
  lines.push(`Template: ${merged.template.displayName}`);
  lines.push(`Overall disposition: ${merged.overall_disposition.code}`);
  lines.push(merged.overall_disposition.recommendation);
  lines.push("");
  lines.push("This email includes the full report as a DOCX attachment.");
  return lines.join("\n");
}

export async function sendProtocolAdvisorResultsEmail(ctx, services) {
  const merged = ctx.steps.aggregateReport;
  const finalReport = ctx.steps.synthesizeFinalReport;
  const reportDocx = ctx.steps.renderReportDocx;
  const requester =
    services.user ||
    (typeof services.users?.getUser === "function" && services.userId
      ? await services.users.getUser(services.userId)
      : null);
  const recipient = requester?.email || requester?.Email || null;

  const output = {
    workflow: merged.workflow,
    template: merged.template,
    status: merged.overall_disposition.code,
    protocol: {
      id: merged.subject_id,
      files: merged.subject_files,
    },
    mergedReview: merged,
    report: {
      markdown: finalReport.markdown,
      filename: reportDocx.filename,
    },
  };

  if (!recipient) {
    return {
      ...output,
      delivery: {
        mode: "email",
        status: "recipient_unavailable",
        recipient: null,
      },
    };
  }

  if (typeof services.sendEmail !== "function") {
    return {
      ...output,
      delivery: {
        mode: "email",
        status: "pending_delivery",
        recipient,
      },
    };
  }

  const subject = `Protocol Advisor Results: ${merged.template.displayName}`;
  await services.sendEmail({
    to: recipient,
    subject,
    text: buildEmailText(merged),
    report: output,
    attachments: [
      {
        filename: reportDocx.filename,
        content: reportDocx.buffer,
        contentType: reportDocx.contentType,
      },
    ],
  });

  return {
    ...output,
    delivery: {
      mode: "email",
      status: "sent",
      recipient,
      subject,
    },
  };
}
