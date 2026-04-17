import { markdownToDocxBuffer } from "./markdown-docx.js";

export async function renderProtocolAdvisorReportDocx(ctx) {
  const merged = ctx.steps.aggregateReport;
  const finalReport = ctx.steps.synthesizeFinalReport;
  const primaryFileName =
    (merged.subject_files || []).find((file) => file?.name && file.name !== "protocolText")?.name ||
    "";

  const filenameBase = String(
    primaryFileName ||
      (merged.subject_path && merged.subject_path !== "protocolText"
        ? merged.subject_path
        : "protocol-advisor-report")
  )
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const buffer = await markdownToDocxBuffer(finalReport.markdown, {
    title: `${merged.subject_id} Final Report`,
  });

  return {
    filename: `${filenameBase || "protocol-advisor-report"}.docx`,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer,
  };
}
