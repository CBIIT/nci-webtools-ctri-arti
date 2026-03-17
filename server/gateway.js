import { getGatewayModule } from "./compose.js";

async function callGateway(method, ...args) {
  return (await getGatewayModule())[method](...args);
}

export { getGatewayModule };

export const invoke = (...args) => callGateway("invoke", ...args);
export const embed = (...args) => callGateway("embed", ...args);
export const listModels = (...args) => callGateway("listModels", ...args);
export const listGuardrails = (...args) => callGateway("listGuardrails", ...args);
export const reconcileGuardrails = (...args) => callGateway("reconcileGuardrails", ...args);
export const deleteGuardrail = (...args) => callGateway("deleteGuardrail", ...args);
export const trackUsage = (...args) => callGateway("trackUsage", ...args);
export const trackModelUsage = (...args) => callGateway("trackModelUsage", ...args);
