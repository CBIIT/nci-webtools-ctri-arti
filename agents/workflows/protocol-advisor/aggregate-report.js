function countByStatus(results) {
  return results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] || 0) + 1;
    return counts;
  }, {});
}

export function aggregateProtocolAdvisorReport(ctx) {
  const matches = ctx.steps.matchSections;
  const parseProtocol = ctx.steps.parseProtocol;
  const selectedTemplate = ctx.steps.loadAssets.selectedTemplate;
  const countsByStatus = countByStatus(matches);

  return {
    workflow: ctx.workflow.name,
    runId: ctx.workflow.runId,
    status: "deterministic_review",
    reviewMode: "deterministic_only",
    template: {
      templateId: selectedTemplate.templateId,
      displayName: selectedTemplate.displayName,
      kind: selectedTemplate.kind,
      selectionRule: selectedTemplate.selectionRule,
      url: selectedTemplate.url,
    },
    protocol: {
      source: parseProtocol.source,
      contentType: parseProtocol.contentType,
      characterCount: parseProtocol.text.length,
      candidateSectionCount: ctx.steps.splitSections.length,
    },
    summary: {
      countsByStatus,
      missingSections: matches
        .filter((section) => section.status === "missing")
        .map((section) => ({
          templateSectionId: section.templateSectionId,
          templateSectionTitle: section.templateSectionTitle,
        }))
        .slice(0, 10),
      placeholderSections: matches
        .filter((section) => section.status === "placeholder")
        .map((section) => ({
          templateSectionId: section.templateSectionId,
          templateSectionTitle: section.templateSectionTitle,
        }))
        .slice(0, 10),
    },
    sections: matches,
  };
}
