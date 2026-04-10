import logger from "shared/logger.js";
import {
  requestContextToInternalHeaders,
  requireUserRequestContext,
} from "shared/request-context.js";

import { createPlainError, requestJson, streamNdjsonRequest } from "../shared/clients/http.js";

function createAgentsError(response, _message, payload) {
  return createPlainError(response, `Agents error: ${response.status}`, payload);
}

export function createAgentsRemote({ baseUrl, fetchImpl = fetch }) {
  function createRequestOptions(requestContext, body) {
    return {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...requestContextToInternalHeaders(requestContext),
      },
      body,
      errorMessage: "Agents request failed",
      createError: createAgentsError,
    };
  }

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
      const options = createRequestOptions(requestContext, {
        message,
        modelOverride,
        thoughtBudget,
        background,
      });

      if (background) {
        const result = await requestJson(fetchImpl, { url, ...options });
        yield { backgroundAccepted: result };
        return;
      }

      for await (const event of streamNdjsonRequest(fetchImpl, {
        url,
        ...options,
        onParseError: (error) => logger.error("Error parsing agent stream line:", error),
      })) {
        yield event;
      }
    },
  };
}
