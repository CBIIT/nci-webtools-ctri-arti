/**
 * Agents Client
 *
 * Factory-pattern client for the agents service.
 * - Monolith mode: imports loop.js directly
 * - Microservice mode: HTTP calls to agents service
 */

import { parseNdjsonStream } from "./ndjson.js";

const AGENTS_URL = process.env.AGENTS_URL;

function buildDirectClient() {
  let runAgentLoop;
  let gatewayClient;
  let cmsClient;

  async function ensureImports() {
    if (!runAgentLoop) {
      const loopModule = await import("agents/loop.js");
      runAgentLoop = loopModule.runAgentLoop;
      const gw = await import("./gateway.js");
      gatewayClient = { invoke: gw.invoke, embed: gw.embed };
      const cms = await import("./cms.js");
      cmsClient = cms.cmsClient;
    }
  }

  return {
    async *chat({ userId, agentId, conversationId, message, model, thoughtBudget }) {
      await ensureImports();
      yield* runAgentLoop({
        userId,
        agentId,
        conversationId,
        userMessage: { role: "user", content: message.content },
        model,
        thoughtBudget: thoughtBudget || 0,
        gateway: gatewayClient,
        cms: cmsClient,
      });
    },
  };
}

function buildHttpClient() {
  return {
    async *chat({ userId, agentId, conversationId, message, model, thoughtBudget }) {
      const response = await fetch(
        `${AGENTS_URL}/api/agents/${agentId}/conversations/${conversationId}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": String(userId),
          },
          body: JSON.stringify({ message, model, thoughtBudget }),
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
