import {
  BASE_SOURCE_DEFINITIONS,
  CATEGORY_DEFINITIONS,
  DEFAULT_MODEL,
  PROMPT_PATHS,
  TEMPLATE_DEFINITIONS,
} from "./review-config.js";
import { readUtf8 } from "./review-helpers.js";

export async function loadProtocolAdvisorAssets(ctx) {
  const selectedTemplate = TEMPLATE_DEFINITIONS[ctx.input.templateId];
  if (!selectedTemplate) {
    throw new Error(`Unsupported protocol_advisor templateId: ${ctx.input.templateId}`);
  }

  const model = ctx.input.model || ctx.options.model || DEFAULT_MODEL;
  const sources = [
    ...BASE_SOURCE_DEFINITIONS,
    {
      id: selectedTemplate.id,
      title: selectedTemplate.title,
      path: selectedTemplate.path,
      defaultCategory: "template_completeness",
      instruction:
        "Review this template as a completeness and structure source. Focus on missing required content, blank sections, placeholder language, and weak coverage.",
    },
  ].map((source) => ({
    ...source,
    text: readUtf8(source.path),
  }));

  return {
    workflowId: "protocol_advisor",
    workflowName: "Protocol Advisor",
    model,
    categories: CATEGORY_DEFINITIONS,
    categoryIds: CATEGORY_DEFINITIONS.map((item) => item.id),
    categoryMap: Object.fromEntries(CATEGORY_DEFINITIONS.map((item) => [item.id, item.title])),
    prompts: {
      system: readUtf8(PROMPT_PATHS.system),
      sourceReview: readUtf8(PROMPT_PATHS.sourceReview),
      contradictionReviewSystem: readUtf8(PROMPT_PATHS.contradictionReviewSystem),
      contradictionReviewUser: readUtf8(PROMPT_PATHS.contradictionReviewUser),
      finalReport: readUtf8(PROMPT_PATHS.finalReport),
      sourceReviewSchema: readUtf8(PROMPT_PATHS.sourceReviewSchema),
    },
    selectedTemplate,
    sources,
  };
}
