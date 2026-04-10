import protocolAdvisorWorkflow from "./protocol-advisor/workflow.js";
import { runWorkflowDefinition } from "./runtime/runner.js";

const workflows = {
  protocol_advisor: protocolAdvisorWorkflow,
};

export function getWorkflow(name) {
  return workflows[name] || null;
}

export function listWorkflows() {
  return Object.keys(workflows);
}

export async function runWorkflow(name, input = {}, { options = {}, services = {} } = {}) {
  const workflow = getWorkflow(name);
  if (!workflow) {
    throw new Error(`Unknown workflow: ${name}`);
  }

  return runWorkflowDefinition(workflow, input, { options, services });
}
