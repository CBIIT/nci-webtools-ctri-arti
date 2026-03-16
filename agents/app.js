import { requireUserRequestContext } from "shared/request-context.js";

import { runAgentLoop } from "./loop.js";

function createAppError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function createAgentsApplication({
  runLoop = runAgentLoop,
  gateway,
  cms,
  source = "direct",
} = {}) {
  return {
    async *chat({ context, userId, agentId, conversationId, message, modelOverride, thoughtBudget }) {
      const requestContext = requireUserRequestContext(context ?? userId, { source });

      if (!message?.content) {
        throw createAppError(400, "Message content required");
      }

      yield* runLoop({
        userId: requestContext.userId,
        agentId,
        conversationId,
        userMessage: { role: "user", content: message.content },
        modelOverride,
        thoughtBudget: thoughtBudget || 0,
        gateway,
        cms,
      });
    },
  };
}
