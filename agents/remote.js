import {
  requestContextToInternalHeaders,
  requireUserRequestContext,
} from "shared/request-context.js";

import { parseNdjsonStream } from "../shared/clients/ndjson.js";

export function createAgentsRemote({ baseUrl }) {
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
      const response = await fetch(
        `${baseUrl}/api/agents/${agentId}/conversations/${conversationId}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...requestContextToInternalHeaders(requestContext),
          },
          body: JSON.stringify({ message, modelOverride, thoughtBudget }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Agents error: ${response.status}`);
      }

      for await (const event of parseNdjsonStream(response.body, {
        onParseError: (error) => console.error("Error parsing agent stream line:", error),
      })) {
        yield event;
      }
    },
  };
}
