import { invokeGatewayText, renderTemplate } from "./review-helpers.js";

function buildFinalReportPayload(merged) {
  const applicableSources = merged.source_verdicts.filter((source) => source.applies);
  return {
    subject_id: merged.subject_id,
    template: merged.template,
    overall_disposition: merged.overall_disposition,
    source_verdicts: applicableSources.map((source) => ({
      source_id: source.source_id,
      source_title: source.source_title,
      verdict: source.verdict,
      review_basis: source.review_basis,
      summary: source.summary,
    })),
    findings_by_category: merged.findings_by_category
      .filter((category) => category.finding_count > 0)
      .map((category) => ({
        category_id: category.category_id,
        category_title: category.category_title,
        findings: category.findings.map((finding) => ({
          source_id: finding.source_id,
          source_title: finding.source_title,
          citation: finding.citation,
          status: finding.status,
          issue_title: finding.issue_title,
          source_excerpt: finding.source_excerpt,
          subject_evidence: finding.subject_evidence,
          analysis: finding.analysis,
          required_action: finding.required_action,
        })),
      })),
    contradiction_review: merged.contradictionReview,
    consent_consistency_review: merged.consentConsistencyReview,
    cross_document_comparison: merged.crossDocComparison,
    consent_context: merged.consentContext || null,
  };
}

function buildFinalReportPrompt(assets, merged) {
  const finalReportPayload = buildFinalReportPayload(merged);
  return renderTemplate(assets.prompts.finalReport, {
    workflow_id: assets.workflowId,
    workflow_name: assets.workflowName,
    subject_id: merged.subject_id,
    subject_path: merged.subject_path || merged.subject_id,
    template_ids: merged.template.templateId,
    overall_disposition_code: merged.overall_disposition.code,
    overall_disposition_recommendation: merged.overall_disposition.recommendation,
    merged_json: JSON.stringify(finalReportPayload, null, 2),
  });
}

export async function synthesizeProtocolAdvisorFinalReport(ctx, services) {
  if (!services.gateway || typeof services.gateway.invoke !== "function") {
    throw new Error("protocol_advisor requires a gateway service for final report synthesis");
  }

  const assets = ctx.steps.loadAssets;
  const merged = ctx.steps.aggregateReport;
  const systemPrompt = ctx.steps.executeSourceReviews.systemPrompt;
  const userText = buildFinalReportPrompt(assets, merged);
  const { response, text } = await invokeGatewayText({
    gateway: services.gateway,
    userId: services.userId,
    requestId: services.requestId || ctx.workflow.runId,
    model: assets.model,
    type: "workflow-protocol_advisor-final_report",
    system: systemPrompt,
    userText,
  });

  return {
    markdown: `${text.trim()}\n`,
    model: assets.model,
    usage: response.usage || null,
    latencyMs: response.metrics?.latencyMs ?? null,
  };
}
