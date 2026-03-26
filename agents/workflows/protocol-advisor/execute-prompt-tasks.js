import { getProtocolAdvisorPromptDefinition, runModelJsonPromptTask } from "./prompt-runtime.js";

function countStatuses(results) {
  return results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] || 0) + 1;
    return counts;
  }, {});
}

async function runSectionReviewTask(task) {
  return {
    promptId: task.promptId,
    scope: task.scope,
    status: "pending_model_review",
    target: {
      templateSectionKey: task.section?.templateSectionKey || null,
      templateSectionId: task.section?.templateSectionId || null,
      templateSectionTitle: task.section?.templateSectionTitle || null,
    },
    output: {
      kind: "section_review",
      state: "not_executed",
      message:
        "Section review prompt is planned and ready for model execution, but prompt execution is not implemented yet.",
    },
  };
}

const promptTaskHandlers = {
  async section_review(task) {
    return runSectionReviewTask(task);
  },
};

async function executePromptTask(task, services) {
  const definition = getProtocolAdvisorPromptDefinition(task.promptId);
  if (!definition) {
    throw new Error(`Unknown protocol_advisor prompt definition: ${task.promptId}`);
  }

  if (definition.execution?.mode === "model_json") {
    return runModelJsonPromptTask(task, services, definition);
  }

  const handler = promptTaskHandlers[task.handler];
  if (!handler) {
    throw new Error(`Unknown protocol_advisor prompt handler: ${task.handler}`);
  }

  return handler(task);
}

export async function executeProtocolAdvisorPromptTasks(ctx, services) {
  const tasks = ctx.steps.buildReviewPlan.promptTasks;
  const results = await Promise.all(tasks.map((task) => executePromptTask(task, services)));

  return {
    results,
    summary: {
      promptTaskCount: tasks.length,
      countsByStatus: countStatuses(results),
    },
  };
}
