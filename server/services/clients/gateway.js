/**
 * Gateway Client
 *
 * Provides a unified interface for AI inference that works in both:
 * - Monolith mode (direct function calls when GATEWAY_URL is not set)
 * - Microservice mode (HTTP calls when GATEWAY_URL is set)
 *
 * Uses a factory pattern — the mode is resolved once at module load time.
 */

import db, { Model, User } from "database";

import { eq, and } from "drizzle-orm";
import { runModel as directRunModel } from "gateway/chat.js";
import { runEmbedding as directRunEmbedding } from "gateway/embedding.js";
import { gatewayError } from "gateway/errors.js";
import { trackModelUsage } from "gateway/usage.js";
import { describeCron } from "shared/cron.js";

const GATEWAY_URL = process.env.GATEWAY_URL;
const USAGE_RESET_SCHEDULE = process.env.USAGE_RESET_SCHEDULE || "0 0 * * *";

const { resetDescription } = describeCron(USAGE_RESET_SCHEDULE);
const RATE_LIMIT_MESSAGE = `You have reached your allocated usage limit. Your access to the chat tool is temporarily disabled and will reset ${resetDescription}. If you need assistance or believe this is an error, please contact the Research Optimizer helpdesk at CTRIBResearchOptimizer@mail.nih.gov.`;

async function checkRateLimit(userID) {
  if (!userID) return null;
  const [user] = await db.select().from(User).where(eq(User.id, userID)).limit(1);
  if (user?.budget !== null && user?.remaining !== null && user?.remaining <= 0) {
    return gatewayError("QUOTA_EXCEEDED", RATE_LIMIT_MESSAGE);
  }
  return null;
}

function buildDirectClient() {
  return {
    async invoke({
      modelID,
      userID,
      agentID,
      messages,
      system,
      tools,
      thoughtBudget,
      stream,
      outputConfig,
      type,
    }) {
      const limited = await checkRateLimit(userID);
      if (limited) return limited;

      // Resolve model record by ID
      const [model] = await db.select().from(Model).where(eq(Model.id, modelID)).limit(1);
      if (!model) return gatewayError("INVALID_MODEL", `Model not found: ${modelID}`);

      const result = await directRunModel({
        model,
        messages,
        system,
        tools,
        thoughtBudget,
        stream,
        outputConfig,
      });

      // Non-streaming: track usage inline
      if (!result?.stream && userID) {
        await trackModelUsage(userID, model, result.usage, { type, agentID });
      }

      // Streaming: wrap to track usage on metadata
      if (result?.stream) {
        return {
          stream: (async function* () {
            for await (const message of result.stream) {
              if (message.metadata && userID) {
                await trackModelUsage(userID, model, message.metadata.usage, { type, agentID });
              }
              yield message;
            }
          })(),
        };
      }

      return result;
    },

    async embed({ modelID, userID, agentID, texts, type }) {
      const limited = await checkRateLimit(userID);
      if (limited) return limited;

      const [model] = await db.select().from(Model).where(eq(Model.id, modelID)).limit(1);
      if (!model) return gatewayError("INVALID_MODEL", `Model not found: ${modelID}`);

      const result = await directRunEmbedding({ model, texts });
      if (result && userID) {
        await trackModelUsage(
          userID,
          model,
          { inputTokens: result.usage.promptTokens, outputTokens: 0 },
          { type, agentID }
        );
      }
      return result;
    },

    async listModels({ type } = {}) {
      const where = [eq(Model.providerID, 1)];
      if (type) where.push(eq(Model.type, type));

      return db
        .select({
          id: Model.id,
          name: Model.name,
          internalName: Model.internalName,
          type: Model.type,
          maxContext: Model.maxContext,
          maxOutput: Model.maxOutput,
          maxReasoning: Model.maxReasoning,
        })
        .from(Model)
        .where(and(...where));
    },
  };
}

function buildHttpClient() {
  return {
    async invoke({
      modelID,
      userID,
      agentID,
      messages,
      system,
      tools,
      thoughtBudget,
      stream,
      outputConfig,
      type,
    }) {
      const response = await fetch(`${GATEWAY_URL}/api/v1/modelInvoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          modelID,
          userID,
          agentID,
          messages,
          system,
          tools,
          stream,
          type,
          defaultParameters: {
            thoughtBudget,
            outputConfig,
          },
        }),
      });

      if (!response.ok && !stream) {
        return response.json();
      }

      if (stream) {
        return {
          stream: (async function* () {
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
                    console.error("Error parsing stream line:", e);
                  }
                }
              }
            }

            if (buffer.trim()) {
              try {
                yield JSON.parse(buffer);
              } catch (e) {
                console.error("Error parsing final stream buffer:", e);
              }
            }
          })(),
        };
      }

      return response.json();
    },

    async embed({ modelID, userID, agentID, texts, type }) {
      const response = await fetch(`${GATEWAY_URL}/api/v1/modelInvoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "embedding",
          modelID,
          userID,
          agentID,
          messages: texts,
          type,
        }),
      });
      return response.json();
    },

    async listModels({ type } = {}) {
      const url = type
        ? `${GATEWAY_URL}/api/v1/models?type=${type}`
        : `${GATEWAY_URL}/api/v1/models`;
      const response = await fetch(url);
      return response.json();
    },
  };
}

const client = GATEWAY_URL ? buildHttpClient() : buildDirectClient();

export const { invoke, embed, listModels } = client;
