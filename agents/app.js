import { createCmsService } from "cms/service.js";
import { createGatewayService } from "gateway/service.js";
import { requireUserRequestContext } from "shared/request-context.js";
import { createValidationError } from "shared/utils.js";
import { createUsersApplication } from "users/app.js";

import { runAgentLoop } from "./core/loop.js";
import { validateUserMessageContent } from "./validation.js";

export function createAgentsApplication({
  runLoop = runAgentLoop,
  gateway = createGatewayService(),
  cms,
  users = createUsersApplication(),
  sendEmail = null,
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
        cms: cmsModule,
        users,
        sendEmail,
      });
    },
  };
}
