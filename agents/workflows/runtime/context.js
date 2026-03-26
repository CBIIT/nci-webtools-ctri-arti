import { randomUUID } from "node:crypto";

export function createWorkflowContext({
  workflow,
  input = {},
  options = {},
  assets = {},
  runId = randomUUID(),
} = {}) {
  return {
    workflow: {
      name: workflow?.name || "unknown_workflow",
      runId,
    },
    input,
    options,
    assets,
    steps: {},
    nodeResults: {},
    artifacts: {},
    progress: [],
  };
}
