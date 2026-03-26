function createWorkflowError(message) {
  const error = new Error(message);
  error.code = "WORKFLOW_INVALID";
  return error;
}

function normalizeNode(nodeId, node = {}, knownIds) {
  const deps = Array.isArray(node.deps) ? node.deps : [];
  if (typeof node.run !== "function") {
    throw createWorkflowError(
      `Workflow node "${nodeId}" must define a run(ctx, services) function`
    );
  }

  for (const dep of deps) {
    if (dep === nodeId) {
      throw createWorkflowError(`Workflow node "${nodeId}" cannot depend on itself`);
    }
    if (!knownIds.has(dep)) {
      throw createWorkflowError(`Workflow node "${nodeId}" depends on unknown node "${dep}"`);
    }
  }

  if (node.when != null && typeof node.when !== "function") {
    throw createWorkflowError(
      `Workflow node "${nodeId}" must define when(ctx, services) as a function`
    );
  }

  return {
    ...node,
    deps,
  };
}

export function normalizeWorkflowDefinition(definition = {}) {
  if (!definition || typeof definition !== "object") {
    throw createWorkflowError("Workflow definition must be an object");
  }

  if (!definition.name || typeof definition.name !== "string") {
    throw createWorkflowError("Workflow definition must include a name");
  }

  if (!definition.nodes || typeof definition.nodes !== "object") {
    throw createWorkflowError(`Workflow "${definition.name}" must define nodes`);
  }

  const nodeIds = Object.keys(definition.nodes);
  if (nodeIds.length === 0) {
    throw createWorkflowError(`Workflow "${definition.name}" must define at least one node`);
  }

  const knownIds = new Set(nodeIds);
  const nodes = {};
  for (const nodeId of nodeIds) {
    nodes[nodeId] = normalizeNode(nodeId, definition.nodes[nodeId], knownIds);
  }

  return {
    ...definition,
    maxConcurrency: Math.max(1, Number(definition.maxConcurrency) || 1),
    nodes,
  };
}

export function getTopologicalOrder(definition) {
  const workflow = normalizeWorkflowDefinition(definition);
  const nodeIds = Object.keys(workflow.nodes);
  const inDegree = new Map(nodeIds.map((nodeId) => [nodeId, workflow.nodes[nodeId].deps.length]));
  const dependents = new Map(nodeIds.map((nodeId) => [nodeId, []]));

  for (const nodeId of nodeIds) {
    for (const dep of workflow.nodes[nodeId].deps) {
      dependents.get(dep).push(nodeId);
    }
  }

  const ready = nodeIds.filter((nodeId) => inDegree.get(nodeId) === 0);
  const order = [];

  while (ready.length) {
    const nodeId = ready.shift();
    order.push(nodeId);

    for (const dependentId of dependents.get(nodeId)) {
      const nextDegree = inDegree.get(dependentId) - 1;
      inDegree.set(dependentId, nextDegree);
      if (nextDegree === 0) {
        ready.push(dependentId);
      }
    }
  }

  if (order.length !== nodeIds.length) {
    throw createWorkflowError(`Workflow "${workflow.name}" contains a cycle`);
  }

  return order;
}
