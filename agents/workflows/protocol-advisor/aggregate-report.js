import {
  PROTOCOL_ADVISOR_FOCUS_AREAS,
  getProtocolAdvisorFocusArea,
  normalizeProtocolAdvisorFocusAreaIds,
} from "./focus-areas.js";

function countByStatus(results) {
  return results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] || 0) + 1;
    return counts;
  }, {});
}

function inferFocusAreaIdsFromSection(section) {
  const title =
    `${section.templateSectionTitle} ${section.matchedProtocolSectionTitle || ""}`.toLowerCase();
  const areaIds = new Set();

  if (/risk|safety|monitor|adverse|intervention/.test(title)) {
    areaIds.add("risk_minimization");
  }
  if (/benefit|rationale|endpoint|objective/.test(title)) {
    areaIds.add("risk_benefit_assessment");
  }
  if (/population|inclusion|exclusion|recruit|compensation/.test(title)) {
    areaIds.add("equitable_selection");
  }
  if (/consent|assent/.test(title)) {
    areaIds.add("informed_consent");
  }
  if (/privacy|confidential|data|biospecimen|record/.test(title)) {
    areaIds.add("privacy_confidentiality");
  }
  if (/vulnerable|pregnant|child|prisoner|nih staff|capacity/.test(title)) {
    areaIds.add("vulnerable_population_safeguards");
  }

  return Array.from(areaIds);
}

function buildDefaultFocusAreas(sections) {
  return PROTOCOL_ADVISOR_FOCUS_AREAS.map((area) => {
    const relatedSections = sections.filter((section) =>
      inferFocusAreaIdsFromSection(section).includes(area.id)
    );

    return {
      id: area.id,
      title: area.title,
      citation: area.citation,
      summary:
        relatedSections.length > 0
          ? `${relatedSections.length} related section(s) currently map to this focus area.`
          : "No related sections mapped yet.",
      sectionTitles: relatedSections.map((section) => section.templateSectionTitle),
    };
  });
}

function buildFocusAreas(promptExecution, sections) {
  const overview = promptExecution.results.find(
    (result) => result.promptId === "document_overview" && result.status === "completed"
  );

  const modeledAreas = Array.isArray(overview?.output?.focusAreas)
    ? overview.output.focusAreas
    : [];
  const defaultAreas = buildDefaultFocusAreas(sections);

  return defaultAreas.map((area) => {
    const modeled = modeledAreas.find((candidate) => {
      const normalizedIds = normalizeProtocolAdvisorFocusAreaIds([candidate?.id]);
      return normalizedIds[0] === area.id;
    });

    return {
      ...area,
      title: getProtocolAdvisorFocusArea(area.id)?.title || area.title,
      citation: getProtocolAdvisorFocusArea(area.id)?.citation || area.citation,
      summary: modeled?.summary || area.summary,
      sectionTitles: Array.isArray(modeled?.sectionTitles)
        ? modeled.sectionTitles
        : area.sectionTitles,
    };
  });
}

export function aggregateProtocolAdvisorReport(ctx) {
  const sections = ctx.steps.buildReviewPlan.sections;
  const parseProtocol = ctx.steps.parseProtocol;
  const selectedTemplate = ctx.steps.loadAssets.selectedTemplate;
  const countsByStatus = countByStatus(sections);
  const promptExecution = ctx.steps.executePromptTasks;

  return {
    workflow: ctx.workflow.name,
    runId: ctx.workflow.runId,
    status: "review_plan_ready",
    reviewMode: "deterministic_plus_planned",
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
    reviewPlan: ctx.steps.buildReviewPlan.summary,
    promptPlan: ctx.steps.buildReviewPlan.promptTasks,
    promptExecution,
    focusAreas: buildFocusAreas(promptExecution, sections),
    summary: {
      countsByStatus,
      missingSections: sections
        .filter((section) => section.status === "missing")
        .map((section) => ({
          templateSectionId: section.templateSectionId,
          templateSectionTitle: section.templateSectionTitle,
        }))
        .slice(0, 10),
      placeholderSections: sections
        .filter((section) => section.status === "placeholder")
        .map((section) => ({
          templateSectionId: section.templateSectionId,
          templateSectionTitle: section.templateSectionTitle,
        }))
        .slice(0, 10),
    },
    sections,
  };
}
