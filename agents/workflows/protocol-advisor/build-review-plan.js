import { protocolAdvisorPromptDefinitions } from "./prompt-definitions.js";

function buildDeterministicFeedback(section) {
  switch (section.status) {
    case "missing":
      return "This required section is missing from the uploaded protocol.";
    case "blank":
      return "This section heading is present, but the section body is blank.";
    case "placeholder":
      return "This section still contains placeholder or drafting text and should be completed.";
    default:
      return null;
  }
}

function buildReviewDecision(section) {
  if (
    section.status === "missing" ||
    section.status === "blank" ||
    section.status === "placeholder"
  ) {
    return {
      mode: "deterministic",
      action: "report_now",
      reason: section.status,
      feedback: buildDeterministicFeedback(section),
    };
  }

  return {
    mode: "model_required",
    action: "review_with_template_and_references",
    reason: "matched-content",
    feedback:
      "Matched section should be reviewed against the template guidance and approved references.",
  };
}

function buildSectionReviewShell(section) {
  const review = buildReviewDecision(section);

  return {
    templateSectionKey: section.templateSectionKey,
    templateSectionId: section.templateSectionId,
    templateSectionTitle: section.templateSectionTitle,
    matchStatus: section.matchStatus,
    matchedProtocolSectionId: section.matchedProtocolSectionId,
    matchedProtocolSectionTitle: section.matchedProtocolSectionTitle,
    matchedProtocolSectionContent: section.matchedProtocolSectionContent,
    matchedProtocolSourceOrder: section.matchedProtocolSourceOrder,
    status: section.status,
    issues: section.issues,
    citations: [],
    feedback: review.feedback,
    rationale: section.rationale,
    review,
  };
}

function buildPromptTask({ definition, ctx, section = null, sections = [] }) {
  return {
    promptId: definition.id,
    scope: definition.scope,
    handler: definition.handler,
    description: definition.description,
    templateId: ctx.steps.loadAssets.selectedTemplate.templateId,
    templateName: ctx.steps.loadAssets.selectedTemplate.displayName,
    runId: ctx.workflow.runId,
    input:
      typeof definition.buildInput === "function"
        ? definition.buildInput({ ctx, section, sections })
        : {},
    section: section
      ? {
          templateSectionKey: section.templateSectionKey,
          templateSectionId: section.templateSectionId,
          templateSectionTitle: section.templateSectionTitle,
          matchedProtocolSectionTitle: section.matchedProtocolSectionTitle,
        }
      : null,
  };
}

function buildPromptTasks(ctx, sections) {
  const tasks = [];

  for (const definition of protocolAdvisorPromptDefinitions) {
    if (definition.scope === "document") {
      if (definition.when({ ctx, sections })) {
        tasks.push(buildPromptTask({ definition, ctx, sections }));
      }
      continue;
    }

    if (definition.scope === "section") {
      for (const section of sections) {
        if (!definition.when({ ctx, section, sections })) {
          continue;
        }
        tasks.push(buildPromptTask({ definition, ctx, section, sections }));
      }
    }
  }

  return tasks;
}

export function buildProtocolAdvisorReviewPlan(ctx) {
  const sections = ctx.steps.matchSections.map(buildSectionReviewShell);
  const deterministicSections = sections.filter(
    (section) => section.review.mode === "deterministic"
  );
  const modelReviewSections = sections.filter(
    (section) => section.review.mode === "model_required"
  );
  const promptTasks = buildPromptTasks(ctx, sections);

  return {
    sections,
    promptTasks,
    summary: {
      deterministicSectionCount: deterministicSections.length,
      modelReviewSectionCount: modelReviewSections.length,
      documentPromptCount: promptTasks.filter((task) => task.scope === "document").length,
      sectionPromptCount: promptTasks.filter((task) => task.scope === "section").length,
      promptTaskCount: promptTasks.length,
      pendingModelReviewSectionIds: modelReviewSections.map(
        (section) => section.templateSectionId || section.templateSectionTitle
      ),
    },
  };
}
