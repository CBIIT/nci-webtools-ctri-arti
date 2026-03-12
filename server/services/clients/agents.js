/**
 * Agents Client
 *
 * Factory-pattern client for the agents service.
 * - Monolith mode: imports loop.js directly
 * - Microservice mode: HTTP calls to agents service
 */

const AGENTS_URL = process.env.AGENTS_URL;

function buildDirectClient() {
  let runAgentLoop;
  let gatewayClient;
  let cmsClient;

  async function ensureImports() {
    if (!runAgentLoop) {
      const loopModule = await import("agents/loop.js");
      runAgentLoop = loopModule.runAgentLoop;
      const gw = await import("shared/clients/gateway.js");
      gatewayClient = { invoke: gw.invoke };
      const cms = await import("shared/clients/cms.js");
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

      // Parse NDJSON stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              yield JSON.parse(line);
            } catch (e) {
              console.error("Error parsing agent stream line:", e);
            }
          }
        }
      }

      if (buffer.trim()) {
        try {
          yield JSON.parse(buffer);
        } catch (e) {
          console.error("Error parsing final agent stream buffer:", e);
        }
      }
    },
  };
}

export const agentsClient = AGENTS_URL ? buildHttpClient() : buildDirectClient();
