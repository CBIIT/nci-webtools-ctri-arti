import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { protocolAdvisorPromptDefinitions } from "./prompt-definitions.js";

const promptDefinitionById = new Map(
  protocolAdvisorPromptDefinitions.map((definition) => [definition.id, definition])
);

function extractTextFromInvokeResult(result) {
  const content = result?.output?.message?.content || [];
  return content
    .map((block) => block?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildPromptTarget(task) {
  return {
    templateSectionId: task.section?.templateSectionId || null,
    templateSectionTitle: task.section?.templateSectionTitle || null,
  };
}

function resolvePromptTemplatePath(relativePath) {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

function renderPromptTemplate(template, variables = {}) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key) => variables[key] || "");
}

function buildPromptFromTemplates(definition, input, task, services) {
  const context =
    typeof definition.buildPromptContext === "function"
      ? definition.buildPromptContext({ input, task, services })
      : {};

  const systemTemplate = readFileSync(
    resolvePromptTemplatePath(definition.promptTemplates.system),
    "utf-8"
  );
  const userTemplate = readFileSync(
    resolvePromptTemplatePath(definition.promptTemplates.user),
    "utf-8"
  );

  return {
    system: renderPromptTemplate(systemTemplate, context).trim(),
    user: renderPromptTemplate(userTemplate, context).trim(),
  };
}

export function getProtocolAdvisorPromptDefinition(promptId) {
  return promptDefinitionById.get(promptId) || null;
}

export async function runModelJsonPromptTask(task, services, definition) {
  if (!services.gateway) {
    return {
      promptId: task.promptId,
      scope: task.scope,
      status: "pending_model_review",
      target: buildPromptTarget(task),
      output: {
        kind: task.promptId,
        state: "not_executed",
        message: "Prompt is planned, but no gateway service was provided for model execution.",
      },
    };
  }

  try {
    const prompt = definition.promptTemplates
      ? buildPromptFromTemplates(definition, task.input, task, services)
      : definition.buildPrompt({ input: task.input, task, services });
    const result = await services.gateway.invoke({
      userId: services.userId,
      requestId: services.requestId,
      model: definition.execution?.model,
      system: prompt.system,
      messages: [{ role: "user", content: [{ text: prompt.user }] }],
      type: `workflow-${task.promptId}`,
    });

    const rawText = extractTextFromInvokeResult(result);
    if (!rawText) {
      throw new Error("Prompt execution returned no text output");
    }

    const output = definition.parseOutput(rawText);

    return {
      promptId: task.promptId,
      scope: task.scope,
      status: "completed",
      target: buildPromptTarget(task),
      output,
    };
  } catch (error) {
    return {
      promptId: task.promptId,
      scope: task.scope,
      status: "failed",
      target: buildPromptTarget(task),
      output: {
        kind: task.promptId,
        state: "failed",
        error: error.message || String(error),
      },
    };
  }
}
