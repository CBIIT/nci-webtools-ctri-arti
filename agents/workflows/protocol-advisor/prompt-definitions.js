import {
  PROTOCOL_ADVISOR_FOCUS_AREAS,
  normalizeProtocolAdvisorFocusAreaIds,
} from "./focus-areas.js";

function createPromptDefinition(definition) {
  return definition;
}

function extractJsonObject(raw = "") {
  const fencedMatch = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Prompt output did not contain a JSON object");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseSectionReviewOutput(raw) {
  const parsed = extractJsonObject(raw);

  return {
    status: typeof parsed.status === "string" ? parsed.status : "insufficient",
    feedback:
      typeof parsed.feedback === "string"
        ? parsed.feedback
        : "Model response did not include structured feedback.",
    issues: normalizeArray(parsed.issues).map((issue) => ({
      type: typeof issue?.type === "string" ? issue.type : "issue",
      message:
        typeof issue?.message === "string" ? issue.message : "Issue identified during review.",
      requiredContent: typeof issue?.requiredContent === "string" ? issue.requiredContent : null,
      requirementReference:
        typeof issue?.requirementReference === "string"
          ? issue.requirementReference
          : typeof issue?.templateRequirementReference === "string"
            ? issue.templateRequirementReference
            : null,
      citations: normalizeArray(issue?.citations),
    })),
    citations: normalizeArray(parsed.citations),
    focusAreas: normalizeProtocolAdvisorFocusAreaIds(parsed.focusAreas),
    raw: parsed,
  };
}

function parseDocumentOverviewOutput(raw) {
  const parsed = extractJsonObject(raw);

  return {
    overallSummary:
      typeof parsed.overallSummary === "string"
        ? parsed.overallSummary
        : "Model response did not include an overall summary.",
    prioritizedNextSteps: normalizeArray(parsed.prioritizedNextSteps),
    groupedThemes: normalizeArray(parsed.groupedThemes).map((theme) => ({
      title: typeof theme?.title === "string" ? theme.title : "Theme",
      summary: typeof theme?.summary === "string" ? theme.summary : "",
      sectionTitles: normalizeArray(theme?.sectionTitles),
    })),
    focusAreas: normalizeArray(parsed.focusAreas).map((area) => ({
      id: normalizeProtocolAdvisorFocusAreaIds([area?.id])[0] || "risk_minimization",
      summary: typeof area?.summary === "string" ? area.summary : "",
      sectionTitles: normalizeArray(area?.sectionTitles),
    })),
    citations: normalizeArray(parsed.citations),
    raw: parsed,
  };
}

export const protocolAdvisorPromptDefinitions = [
  createPromptDefinition({
    id: "section_review",
    scope: "section",
    execution: {
      mode: "model_json",
      model: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    },
    description:
      "Review one matched template section against template guidance and approved references.",
    when({ section }) {
      return section.review.mode === "model_required";
    },
    buildInput({ ctx, section }) {
      return {
        workflow: ctx.workflow.name,
        template: {
          templateId: ctx.steps.loadAssets.selectedTemplate.templateId,
          displayName: ctx.steps.loadAssets.selectedTemplate.displayName,
          canonicalID: ctx.steps.loadAssets.selectedTemplate.canonicalID,
          version: ctx.steps.loadAssets.selectedTemplate.version,
        },
        protocol: {
          source: ctx.steps.parseProtocol.source,
          contentType: ctx.steps.parseProtocol.contentType,
        },
        allowedFocusAreas: PROTOCOL_ADVISOR_FOCUS_AREAS,
        section: {
          templateSectionId: section.templateSectionId,
          templateSectionTitle: section.templateSectionTitle,
          templateSectionGuidanceText: section.templateSectionGuidanceText,
          templateSectionRequired: section.templateSectionRequired,
          matchedProtocolSectionId: section.matchedProtocolSectionId,
          matchedProtocolSectionTitle: section.matchedProtocolSectionTitle,
          matchedProtocolSectionContent: section.matchedProtocolSectionContent,
        },
      };
    },
    promptTemplates: {
      system: "prompts/section_review.system.txt",
      user: "prompts/section_review.user.txt",
    },
    buildPromptContext({ input }) {
      return {
        input_json: JSON.stringify(input, null, 2),
        output_json_example: JSON.stringify(
          {
            status: "ok",
            feedback: "Short actionable feedback",
            issues: [
              {
                type: "insufficient",
                message: "What is missing or weak",
                requiredContent: "What should be added or clarified",
                requirementReference: "1.0",
                citations: [],
              },
            ],
            citations: [],
            focusAreas: ["risk_minimization"],
          },
          null,
          2
        ),
      };
    },
    parseOutput(raw) {
      return parseSectionReviewOutput(raw);
    },
  }),
  createPromptDefinition({
    id: "document_overview",
    scope: "document",
    execution: {
      mode: "model_json",
      model: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    },
    description:
      "Review the protocol as a whole for cross-sectional themes and prioritized next steps.",
    when() {
      return true;
    },
    buildInput({ ctx, sections }) {
      return {
        workflow: ctx.workflow.name,
        template: {
          templateId: ctx.steps.loadAssets.selectedTemplate.templateId,
          displayName: ctx.steps.loadAssets.selectedTemplate.displayName,
          canonicalID: ctx.steps.loadAssets.selectedTemplate.canonicalID,
          version: ctx.steps.loadAssets.selectedTemplate.version,
        },
        protocol: {
          source: ctx.steps.parseProtocol.source,
          contentType: ctx.steps.parseProtocol.contentType,
          candidateSectionCount: ctx.steps.splitSections.length,
        },
        allowedFocusAreas: PROTOCOL_ADVISOR_FOCUS_AREAS,
        sections: sections.map((section) => ({
          templateSectionId: section.templateSectionId,
          templateSectionTitle: section.templateSectionTitle,
          status: section.status,
        })),
      };
    },
    promptTemplates: {
      system: "prompts/document_overview.system.txt",
      user: "prompts/document_overview.user.txt",
    },
    buildPromptContext({ input }) {
      return {
        input_json: JSON.stringify(input, null, 2),
        output_json_example: JSON.stringify(
          {
            overallSummary: "Short overall summary",
            prioritizedNextSteps: ["Add missing sections", "Strengthen weak sections"],
            groupedThemes: [
              {
                title: "Missing Content",
                summary: "Sections that are absent or too thin.",
                sectionTitles: ["PROTOCOL SUMMARY"],
              },
            ],
            focusAreas: PROTOCOL_ADVISOR_FOCUS_AREAS.map((area) => ({
              id: area.id,
              summary: `${area.title} summary`,
              sectionTitles: [],
            })),
            citations: [],
          },
          null,
          2
        ),
      };
    },
    parseOutput(raw) {
      return parseDocumentOverviewOutput(raw);
    },
  }),
];

export default protocolAdvisorPromptDefinitions;
