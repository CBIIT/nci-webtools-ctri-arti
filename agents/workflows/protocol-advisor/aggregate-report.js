import { countBy, normalizeText, overallDisposition, verdictRank } from "./review-helpers.js";

function buildContradictionSection(lines, heading, review) {
  if (review.status !== "completed" || review.findings.length === 0) {
    return;
  }

  lines.push(heading);
  lines.push("");
  lines.push(review.overallSummary);
  lines.push("");
  for (const finding of review.findings) {
    lines.push(`- [${finding.severity}] ${finding.concept || finding.category}`);
    const locA = finding.sectionA.sectionId || "unspecified";
    const pageA = finding.sectionA.page ? ` (p. ${finding.sectionA.page})` : "";
    lines.push(`  - Section A: ${locA} ${finding.sectionA.sectionTitle}${pageA}`);
    lines.push(`  - Quote A: ${finding.sectionA.quote}`);
    const locB = finding.sectionB.sectionId || "unspecified";
    const pageB = finding.sectionB.page ? ` (p. ${finding.sectionB.page})` : "";
    lines.push(`  - Section B: ${locB} ${finding.sectionB.sectionTitle}${pageB}`);
    lines.push(`  - Quote B: ${finding.sectionB.quote}`);
    lines.push(`  - Explanation: ${finding.explanation}`);
    lines.push(`  - Resolution Guidance: ${finding.resolutionGuidance}`);
  }
  lines.push("");
}

function buildCrossDocSection(lines, heading, review) {
  if (review.status !== "completed" || review.findings.length === 0) {
    return;
  }

  lines.push(heading);
  lines.push("");
  lines.push(review.overallSummary);
  lines.push("");
  for (const finding of review.findings) {
    lines.push(`- [${finding.severity}] ${finding.concept || finding.category}`);
    lines.push(`  - Direction: ${finding.direction}`);
    lines.push(`  - Likely Out of Sync: ${finding.likelyOutOfSync}`);
    const protocolLoc = finding.protocol.sectionId || "unspecified";
    const protocolPage = finding.protocol.page ? ` (p. ${finding.protocol.page})` : "";
    const protocolFile = finding.protocol.fileName ? ` [${finding.protocol.fileName}]` : "";
    lines.push(
      `  - Protocol: ${protocolLoc} ${finding.protocol.sectionTitle}${protocolPage}${protocolFile}`
    );
    lines.push(`  - Protocol Quote: ${finding.protocol.quote}`);
    const consentLoc = finding.consent.sectionId || "unspecified";
    const consentPage = finding.consent.page ? ` (p. ${finding.consent.page})` : "";
    const consentFile = finding.consent.fileName ? ` [${finding.consent.fileName}]` : "";
    lines.push(
      `  - Consent: ${consentLoc} ${finding.consent.sectionTitle}${consentPage}${consentFile}`
    );
    lines.push(`  - Consent Quote: ${finding.consent.quote}`);
    lines.push(`  - Explanation: ${finding.explanation}`);
    lines.push(`  - Resolution Guidance: ${finding.resolutionGuidance}`);
  }
  lines.push("");
}

function buildAuditReport(
  merged,
  contradictionReview,
  consentConsistencyReview,
  crossDocComparison
) {
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

  buildContradictionSection(lines, "## INTERNAL CONTRADICTIONS REVIEW", contradictionReview);
  buildContradictionSection(
    lines,
    "## INTERNAL CONSENT FORM CONSISTENCY REVIEW",
    consentConsistencyReview
  );
  buildCrossDocSection(lines, "## PROTOCOL VS CONSENT CROSS-DOCUMENT REVIEW", crossDocComparison);

  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

function buildContradictionReview(result) {
  if (!result) {
    return {
      status: "not_executed",
      overallSummary: "",
      documentClean: true,
      findings: [],
    };
  }

  if (result.status === "completed") {
    return {
      status: "completed",
      overallSummary: result.output?.overallSummary || "",
      documentClean: Array.isArray(result.output?.findings) && result.output.findings.length === 0,
      findings: Array.isArray(result.output?.findings) ? result.output.findings : [],
    };
  }

  if (result.status === "failed") {
    return {
      status: "failed",
      overallSummary: result.output?.error || "Contradiction review failed.",
      documentClean: false,
      findings: [],
    };
  }

  return {
    status: "not_executed",
    overallSummary: result.output?.message || "",
    documentClean: true,
    findings: [],
  };
}

function buildCrossDocReview(result) {
  if (!result) {
    return {
      status: "not_executed",
      overallSummary: "",
      documentsAligned: true,
      findings: [],
    };
  }

  if (result.status === "completed") {
    return {
      status: "completed",
      overallSummary: result.output?.overallSummary || "",
      documentsAligned:
        Array.isArray(result.output?.findings) && result.output.findings.length === 0,
      findings: Array.isArray(result.output?.findings) ? result.output.findings : [],
    };
  }

  if (result.status === "failed") {
    return {
      status: "failed",
      overallSummary: result.output?.error || "Cross-document comparison failed.",
      documentsAligned: false,
      findings: [],
    };
  }

  return {
    status: "not_executed",
    overallSummary: result.output?.message || "",
    documentsAligned: true,
    findings: [],
  };
}

export function aggregateProtocolAdvisorReport(ctx) {
  const assets = ctx.steps.loadAssets;
  const parsedProtocol = ctx.steps.parseProtocol;
  const reviewArtifacts = ctx.steps.executeSourceReviews.results;
  const contradictionReview = buildContradictionReview(ctx.steps.executeContradictionReview);
  const consentConsistencyReview = buildContradictionReview(
    ctx.steps.executeConsentConsistencyReview
  );
  const crossDocComparison = buildCrossDocReview(ctx.steps.executeCrossDocComparison);

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
    consentContext: ctx.steps.parseConsent
      ? {
          source: ctx.steps.parseConsent.source,
          name: ctx.steps.parseConsent.name,
          contentType: ctx.steps.parseConsent.contentType,
        }
      : null,
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
    contradictionReview,
    consentConsistencyReview,
    crossDocComparison,
    audit_report_markdown: buildAuditReport(
      merged,
      contradictionReview,
      consentConsistencyReview,
      crossDocComparison
    ),
  };
}
