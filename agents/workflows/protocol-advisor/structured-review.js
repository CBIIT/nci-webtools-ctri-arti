import { invokeGatewayJson, renderTemplate } from "./review-helpers.js";

export function createStructuredReviewExecutor({
  serviceError,
  systemPromptKey,
  userPromptKey,
  gatewayType,
  buildInput,
  buildUserInput,
  outputExample,
  normalize,
  emptySummary,
}) {
  return async function runStructuredReview(ctx, services) {
    if (!services.gateway || typeof services.gateway.invoke !== "function") {
      throw new Error(serviceError);
    }

    const assets = ctx.steps.loadAssets;
    const input = buildInput(ctx);
    const userText = renderTemplate(assets.prompts[userPromptKey], {
      input_json: JSON.stringify(buildUserInput(input), null, 2),
      output_json_example: JSON.stringify(outputExample, null, 2),
    }).trim();

    const { response, json } = await invokeGatewayJson({
      gateway: services.gateway,
      userId: services.userId,
      requestId: services.requestId || ctx.workflow.runId,
      model: assets.model,
      type: gatewayType,
      system: assets.prompts[systemPromptKey].trim(),
      userText,
    });

    return {
      status: "completed",
      model: assets.model,
      input,
      output: normalize(json, { emptySummary }),
      usage: response.usage || null,
      latencyMs: response.metrics?.latencyMs ?? null,
    };
  };
}
