import { createCmsService } from "cms/service.js";
import { createGatewayService } from "gateway/service.js";
import { requireUserRequestContext } from "shared/request-context.js";
import { createUsersApplication } from "users/app.js";

import { runAgentLoop } from "./core/loop.js";

function createAppError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function createAgentsApplication({
  runLoop = runAgentLoop,
  gateway = createGatewayService(),
  cms,
  users = createUsersApplication(),
  source = "direct",
} = {}) {
  const cmsModule = cms ?? createCmsService({ gateway, source });

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
        throw createAppError(400, "Message content required");
      }

      yield* runLoop({
        userId: requestContext.userId,
        requestId: requestContext.requestId,
        agentId,
        conversationId,
        userMessage: { role: "user", content: message.content },
        modelOverride,
        thoughtBudget: thoughtBudget || 0,
        gateway,
        cms: cmsModule,
        users,
      });
    },
  };
}
