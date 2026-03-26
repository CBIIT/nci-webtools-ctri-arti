import { createWorkflowContext } from "./context.js";
import { getTopologicalOrder, normalizeWorkflowDefinition } from "./graph.js";

export async function runWorkflowDefinition(
  definition,
  input = {},
  { options = {}, services = {} } = {}
) {
  const workflow = normalizeWorkflowDefinition(definition);
  const nodeIds = getTopologicalOrder(workflow);
  const ctx = createWorkflowContext({ workflow, input, options });
  const remainingDeps = new Map(
    nodeIds.map((nodeId) => [nodeId, workflow.nodes[nodeId].deps.length])
  );
  const dependents = new Map(nodeIds.map((nodeId) => [nodeId, []]));

  for (const nodeId of nodeIds) {
    for (const dep of workflow.nodes[nodeId].deps) {
      dependents.get(dep).push(nodeId);
    }
  }

  const ready = nodeIds.filter((nodeId) => remainingDeps.get(nodeId) === 0);
  let completedCount = 0;

  while (ready.length) {
    const batchIds = ready.splice(0, workflow.maxConcurrency);
    const batchResults = await Promise.all(
      batchIds.map(async (nodeId) => {
        const node = workflow.nodes[nodeId];
        const startedAt = new Date().toISOString();
        const shouldRun = node.when ? await node.when(ctx, services) : true;

        if (!shouldRun) {
          return {
            nodeId,
            status: "skipped",
            startedAt,
            completedAt: new Date().toISOString(),
            result: null,
          };
        }

        const result = await node.run(ctx, services);
        return {
          nodeId,
          status: "completed",
          startedAt,
          completedAt: new Date().toISOString(),
          result,
        };
      })
    );

    for (const nodeResult of batchResults) {
      ctx.steps[nodeResult.nodeId] = nodeResult.result;
      ctx.nodeResults[nodeResult.nodeId] = {
        status: nodeResult.status,
        startedAt: nodeResult.startedAt,
        completedAt: nodeResult.completedAt,
      };
      ctx.progress.push({
        nodeId: nodeResult.nodeId,
        status: nodeResult.status,
        completedAt: nodeResult.completedAt,
      });
      completedCount += 1;

      for (const dependentId of dependents.get(nodeResult.nodeId)) {
        const nextCount = remainingDeps.get(dependentId) - 1;
        remainingDeps.set(dependentId, nextCount);
        if (nextCount === 0) {
          ready.push(dependentId);
        }
      }
    }
  }

  if (completedCount !== nodeIds.length) {
    throw new Error(`Workflow "${workflow.name}" stalled before all nodes completed`);
  }

  const output =
    typeof workflow.output === "function"
      ? await workflow.output(ctx, services)
      : ctx.steps[nodeIds.at(-1)];

  return { context: ctx, output };
}
