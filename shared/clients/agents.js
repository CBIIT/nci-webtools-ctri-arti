/**
 * Agents Client
 *
 * Factory-pattern client for the agents service.
 * - Monolith mode: imports loop.js directly
 * - Microservice mode: HTTP calls to agents service
 */

import { parseNdjsonStream } from "./ndjson.js";
import { requestContextToInternalHeaders, requireUserRequestContext } from "../request-context.js";

const AGENTS_URL = process.env.AGENTS_URL;

function buildDirectClient() {
  let agentsApp;
  let gatewayClient;
  let cmsClient;

  async function ensureImports() {
    if (!agentsApp) {
      const appModule = await import("agents/app.js");
      const gw = await import("./gateway.js");
      gatewayClient = { invoke: gw.invoke, embed: gw.embed };
      const cms = await import("./cms.js");
      cmsClient = cms.cmsClient;
      agentsApp = appModule.createAgentsApplication({
        source: "direct",
        gateway: gatewayClient,
        cms: cmsClient,
      });
    }
  }

  return {
    async *chat({ context, userId, agentId, conversationId, message, modelOverride, thoughtBudget }) {
      await ensureImports();
      yield* agentsApp.chat({
        context: context ?? userId,
        agentId,
        conversationId,
        message,
        modelOverride,
        thoughtBudget,
      });
    },
  };
}

function buildHttpClient() {
  return {
    async *chat({ context, userId, agentId, conversationId, message, modelOverride, thoughtBudget }) {
      const requestContext = requireUserRequestContext(context ?? userId, { source: "internal-http" });
      const response = await fetch(
        `${AGENTS_URL}/api/agents/${agentId}/conversations/${conversationId}/chat`,
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

export const agentsClient = AGENTS_URL ? buildHttpClient() : buildDirectClient();
