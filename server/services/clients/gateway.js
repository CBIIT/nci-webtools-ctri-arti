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

import { runModel as directRunModel } from "gateway/inference.js";
import { trackModelUsage } from "gateway/usage.js";

const GATEWAY_URL = process.env.GATEWAY_URL;

const RATE_LIMIT_MESSAGE =
  "You have reached your allocated weekly usage limit. Your access to the chat tool is temporarily disabled and will reset on Monday at 12:00 AM. If you need assistance or believe this is an error, please contact the Research Optimizer helpdesk at CTRIBResearchOptimizer@mail.nih.gov.";

async function checkRateLimit(userID) {
  if (!userID) return null;
  const [user] = await db.select().from(User).where(eq(User.id, userID)).limit(1);
  if (user?.budget !== null && user?.remaining !== null && user?.remaining <= 0) {
    return { error: RATE_LIMIT_MESSAGE, status: 429 };
  }
  return null;
}

function buildDirectClient() {
  return {
    async invoke({ userID, model, messages, system, tools, thoughtBudget, stream, ip, outputConfig }) {
      const limited = await checkRateLimit(userID);
      if (limited) return limited;

      const result = await directRunModel({ model, messages, system, tools, thoughtBudget, stream, outputConfig });

      // For non-streaming responses, track usage inline
      if (!result?.stream && userID) {
        await trackModelUsage(userID, model, ip, result.usage);
      }

      // For streaming, wrap to track usage on metadata
      if (result?.stream) {
        return {
          stream: (async function* () {
            for await (const message of result.stream) {
              if (message.metadata && userID) {
                await trackModelUsage(userID, model, ip, message.metadata.usage);
              }
              yield message;
            }
          })(),
        };
      }

      return result;
    },

    async listModels({ type } = {}) {
      const where = [eq(Model.providerID, 1)];
      if (type) where.push(eq(Model.type, type));

      return db
        .select({
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
    async invoke({ userID, model, messages, system, tools, thoughtBudget, stream, ip, outputConfig }) {
      const response = await fetch(`${GATEWAY_URL}/api/v1/model/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userID, model, messages, system, tools, thoughtBudget, stream, ip, outputConfig }),
      });

      if (response.status === 429) {
        return { error: (await response.json()).error, status: 429 };
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

export const { invoke, listModels } = client;
