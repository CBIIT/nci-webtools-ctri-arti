import { countBy, normalizeText, overallDisposition, verdictRank } from "./review-helpers.js";

function buildAuditReport(merged) {
  const lines = [];
  lines.push("# EXECUTIVE SUMMARY: COMPLIANCE REVIEW");
  lines.push("");
  lines.push(`**Protocol:** ${merged.subject_id}`);
  lines.push(`**Template:** ${merged.template.templateId}`);
  lines.push(`**Overall Disposition:** ${merged.overall_disposition.code}`);
  lines.push("");
  lines.push("## KEY FINDINGS");
  lines.push("");

  const topFindings = merged.findings.filter((item) => !item.duplicate_of).slice(0, 12);
  for (const finding of topFindings) {
    lines.push(
      `- [${finding.status}] ${finding.issue_title} (${finding.citation || finding.source_id})`
    );
  }

  lines.push("");
  lines.push("## SOURCE VERDICTS");
  lines.push("");
  for (const source of merged.source_verdicts) {
    lines.push(`### ${source.source_title}`);
    lines.push(`- Verdict: ${source.verdict}`);
    lines.push(`- Applies: ${source.applies}`);
    lines.push(`- Review basis: ${source.review_basis}`);
    lines.push(`- Summary: ${source.summary}`);
    lines.push("");
  }

  lines.push("## DETAILED FINDINGS");
  lines.push("");
  for (const category of merged.findings_by_category) {
    if (!category.finding_count) continue;
    lines.push(`### ${category.category_title}`);
    lines.push("");
    for (const finding of category.findings) {
      lines.push(`- Issue: ${finding.issue_title}`);
      lines.push(`  - Severity: ${finding.status}`);
      lines.push(`  - Citation: ${finding.citation || "unspecified"}`);
      lines.push(`  - Protocol Evidence: ${finding.subject_evidence}`);
      lines.push(`  - Source Excerpt: ${finding.source_excerpt}`);
      lines.push(`  - Analysis: ${finding.analysis}`);
      lines.push(`  - Required Action: ${finding.required_action}`);
    }
    lines.push("");
  }

  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

export function aggregateProtocolAdvisorReport(ctx) {
  const assets = ctx.steps.loadAssets;
  const parsedProtocol = ctx.steps.parseProtocol;
  const reviewArtifacts = ctx.steps.executeSourceReviews.results;

  const sourceVerdicts = reviewArtifacts.map((artifact) => ({
    source_id: artifact.source_review.source_id,
    source_title: artifact.source_review.source_title,
    applies: artifact.source_review.applies,
    applicability_reason: artifact.source_review.applicability_reason,
    review_basis: artifact.source_review.review_basis,
    review_basis_reason: artifact.source_review.review_basis_reason,
    verdict: artifact.source_review.verdict,
    summary: artifact.summary,
    finding_count: artifact.source_review.findings.length,
  }));

  const findings = [];
  const seenKeys = new Map();
  for (const artifact of reviewArtifacts) {
    const sourceId = artifact.source_review.source_id;
    const sourceTitle = artifact.source_review.source_title;
    for (const finding of artifact.source_review.findings) {
      const mergedFinding = {
        source_id: sourceId,
        source_title: sourceTitle,
        finding_id: `${sourceId}:${finding.finding_id}`,
        category_id: finding.category_id,
        citation: finding.citation,
        status: finding.status,
        issue_title: finding.issue_title,
        source_excerpt: finding.source_excerpt,
        subject_evidence: finding.subject_evidence,
        analysis: finding.analysis,
        required_action: finding.required_action,
        duplicate_of: null,
      };

      const duplicateKey = [
        mergedFinding.category_id,
        mergedFinding.status,
        normalizeText(mergedFinding.issue_title),
        normalizeText(mergedFinding.required_action),
      ].join("::");

      if (seenKeys.has(duplicateKey)) {
        mergedFinding.duplicate_of = seenKeys.get(duplicateKey);
      } else {
        seenKeys.set(duplicateKey, mergedFinding.finding_id);
      }
      findings.push(mergedFinding);
    }
  }

  sourceVerdicts.sort(
    (a, b) =>
      verdictRank(a.verdict) - verdictRank(b.verdict) || a.source_id.localeCompare(b.source_id)
  );
  findings.sort(
    (a, b) =>
      verdictRank(a.status) - verdictRank(b.status) || a.issue_title.localeCompare(b.issue_title)
  );

  const uniqueFindings = findings.filter((item) => !item.duplicate_of);
  const sourceVerdictCounts = countBy(sourceVerdicts, (item) => item.verdict);
  const findingStatusCounts = countBy(findings, (item) => item.status);
  const uniqueFindingStatusCounts = countBy(uniqueFindings, (item) => item.status);
  const findingsByCategory = assets.categories.map((category) => {
    const categoryFindings = uniqueFindings.filter((item) => item.category_id === category.id);
    return {
      category_id: category.id,
      category_title: category.title,
      finding_count: categoryFindings.length,
      counts_by_status: countBy(categoryFindings, (item) => item.status),
      findings: categoryFindings,
    };
  });

  const merged = {
    workflow: assets.workflowName,
    workflow_id: assets.workflowId,
    subject_id: parsedProtocol.name || parsedProtocol.source || "protocol",
    subject_path: parsedProtocol.name || null,
    subject_files: parsedProtocol.files || [],
    template: {
      templateId: assets.selectedTemplate.id,
      displayName: assets.selectedTemplate.title,
    },
    reviewed_source_count: sourceVerdicts.length,
    source_verdict_counts: sourceVerdictCounts,
    finding_count: findings.length,
    unique_finding_count: uniqueFindings.length,
    duplicate_count: findings.filter((item) => item.duplicate_of).length,
    finding_status_counts: findingStatusCounts,
    unique_finding_status_counts: uniqueFindingStatusCounts,
    overall_disposition: overallDisposition(sourceVerdictCounts),
    source_verdicts: sourceVerdicts,
    findings_by_category: findingsByCategory,
    findings,
    generated_at: new Date().toISOString(),
  };

  return {
    ...merged,
    audit_report_markdown: buildAuditReport(merged),
  };
}
