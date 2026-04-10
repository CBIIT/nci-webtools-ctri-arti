import logger from "shared/logger.js";
import {
  requestContextToInternalHeaders,
  requireUserRequestContext,
} from "shared/request-context.js";

import { createPlainError, requestJson, streamNdjsonRequest } from "../shared/clients/http.js";

export function createAgentsRemote({ baseUrl, fetchImpl = fetch }) {
  return {
    async *chat({
      context,
      userId,
      agentId,
      conversationId,
      message,
      modelOverride,
      thoughtBudget,
      background,
    }) {
      const requestContext = requireUserRequestContext(context ?? userId, {
        source: "internal-http",
      });
      const url =
        conversationId == null
          ? `${baseUrl}/api/v1/agents/${agentId}/chat`
          : `${baseUrl}/api/v1/agents/${agentId}/conversations/${conversationId}/chat`;

      if (background) {
        const result = await requestJson(fetchImpl, {
          url,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...requestContextToInternalHeaders(requestContext),
          },
          body: { message, modelOverride, thoughtBudget, background },
          errorMessage: "Agents request failed",
          createError: (response, _message, payload) =>
            createPlainError(response, `Agents error: ${response.status}`, payload),
        });

        yield { backgroundAccepted: result };
        return;
      }

      for await (const event of streamNdjsonRequest(fetchImpl, {
        url,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...requestContextToInternalHeaders(requestContext),
        },
        body: { message, modelOverride, thoughtBudget, background },
        errorMessage: "Agents request failed",
        createError: (response, _message, payload) =>
          createPlainError(response, `Agents error: ${response.status}`, payload),
        onParseError: (error) => logger.error("Error parsing agent stream line:", error),
      })) {
        yield event;
      }
    },
  };
}
