import {
  requestContextToInternalHeaders,
  requireUserRequestContext,
} from "shared/request-context.js";

import { createPlainError, streamNdjsonRequest } from "../shared/clients/http.js";

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
    }) {
      const requestContext = requireUserRequestContext(context ?? userId, {
        source: "internal-http",
      });
      for await (const event of streamNdjsonRequest(fetchImpl, {
        url: `${baseUrl}/api/agents/${agentId}/conversations/${conversationId}/chat`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...requestContextToInternalHeaders(requestContext),
        },
        body: { message, modelOverride, thoughtBudget },
        errorMessage: "Agents request failed",
        createError: (response, _message, payload) =>
          createPlainError(response, `Agents error: ${response.status}`, payload),
        onParseError: (error) => console.error("Error parsing agent stream line:", error),
      })) {
        yield event;
      }
    },
  };
}
