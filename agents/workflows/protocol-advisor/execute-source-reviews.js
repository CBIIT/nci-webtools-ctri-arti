import { MAX_SOURCE_REVIEW_CONCURRENCY } from "./review-config.js";
import { invokeGatewayJson, renderTemplate, validateSourceReview } from "./review-helpers.js";

function buildSystemPrompt(assets, parsedProtocol) {
  return renderTemplate(assets.prompts.system, {
    subject_label: "protocol",
    subject_label_upper: "PROTOCOL",
    subject_path: parsedProtocol.name || parsedProtocol.source || "protocol",
    subject_text: parsedProtocol.text,
    schema_json: assets.prompts.sourceReviewSchema,
  });
}

function buildSourcePrompt(assets, source) {
  return renderTemplate(assets.prompts.sourceReview, {
    workflow_id: assets.workflowId,
    workflow_name: assets.workflowName,
    subject_label: "protocol",
    allowed_category_ids: assets.categoryIds.join(", "),
    source_id: source.id,
    source_title: source.title,
    source_path: source.path,
    source_instruction: source.instruction || "",
    source_text: source.text,
    default_category: source.defaultCategory || assets.categoryIds[0] || "template_completeness",
  });
}

async function reviewOneSource({
  source,
  assets,
  parsedProtocol,
  services,
  requestId,
  systemPrompt,
}) {
  const userText = buildSourcePrompt(assets, source);
  const { response, json } = await invokeGatewayJson({
    gateway: services.gateway,
    userId: services.userId,
    requestId,
    model: assets.model,
    type: "workflow-protocol_advisor-source_review",
    system: systemPrompt,
    userText,
  });

  const validated = validateSourceReview(json, assets.categoryIds, source);
  return {
    ...validated,
    _meta: {
      sourcePath: source.path,
      model: assets.model,
      usage: response.usage || null,
      latencyMs: response.metrics?.latencyMs ?? null,
    },
  };
}

export async function executeProtocolAdvisorSourceReviews(ctx, services) {
  if (!services.gateway || typeof services.gateway.invoke !== "function") {
    throw new Error("protocol_advisor requires a gateway service for source review execution");
  }

  const assets = ctx.steps.loadAssets;
  const parsedProtocol = ctx.steps.parseProtocol;
  const systemPrompt = buildSystemPrompt(assets, parsedProtocol);
  const requestId = services.requestId || ctx.workflow.runId;
  const reviewArtifacts = [];

  async function runBatch(batch) {
    const results = await Promise.all(
      batch.map((source) =>
        reviewOneSource({
          source,
          assets,
          parsedProtocol,
          services,
          requestId,
          systemPrompt,
        })
      )
    );
    reviewArtifacts.push(...results);
  }

  if (assets.sources.length > 0) {
    await runBatch([assets.sources[0]]);
  }

  for (let index = 1; index < assets.sources.length; index += MAX_SOURCE_REVIEW_CONCURRENCY) {
    const batch = assets.sources.slice(index, index + MAX_SOURCE_REVIEW_CONCURRENCY);
    await runBatch(batch);
  }

  return {
    model: assets.model,
    systemPrompt,
    results: reviewArtifacts,
    summary: {
      sourceCount: reviewArtifacts.length,
    },
  };
}
