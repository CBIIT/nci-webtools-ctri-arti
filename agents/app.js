import { requireUserRequestContext } from "shared/request-context.js";
import { createValidationError } from "shared/utils.js";

import { runAgentLoop } from "./core/loop.js";
import { validateUserMessageContent } from "./validation.js";

export function createAgentsApplication({
  runLoop = runAgentLoop,
  gateway,
  cms,
  users,
  sendEmail = null,
  source = "direct",
} = {}) {
  if (!gateway) throw new Error("gateway is required");
  if (!cms) throw new Error("cms is required");
  if (!users) throw new Error("users is required");

  return {
    async *chat({
      context,
      userId,
      agentId,
      conversationId,
      message,
      modelOverride,
      thoughtBudget,
    }) {
      const requestContext = requireUserRequestContext(context ?? userId, { source });

      if (!message?.content) {
        throw createValidationError("Message content required");
      }
      validateUserMessageContent(message.content);

      yield* runLoop({
        userId: requestContext.userId,
        requestId: requestContext.requestId,
        agentId,
        conversationId,
        userMessage: { role: "user", content: message.content },
        modelOverride,
        thoughtBudget: thoughtBudget || 0,
        gateway,
        cms,
        users,
        sendEmail,
      });
    },
  };
}
