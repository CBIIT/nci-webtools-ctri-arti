/**
 * Gateway Client
 *
 * Provides a unified interface for AI inference that works in both:
 * - Monolith mode (direct function calls when GATEWAY_URL is not set)
 * - Microservice mode (HTTP calls when GATEWAY_URL is set)
 *
 * Uses a factory pattern — the mode is resolved once at module load time.
 */

import { parseNdjsonStream } from "./ndjson.js";

const GATEWAY_URL = process.env.GATEWAY_URL;
const USAGE_RESET_SCHEDULE = process.env.USAGE_RESET_SCHEDULE || "0 0 * * *";
let directRuntimePromise;

async function getDirectRuntime() {
  if (!directRuntimePromise) {
    directRuntimePromise = (async () => {
      const [databaseModule, drizzleModule, inferenceModule, usageModule, cronModule] =
        await Promise.all([
          import("database"),
          import("drizzle-orm"),
          import("gateway/inference.js"),
          import("gateway/usage.js"),
          import("shared/cron.js"),
        ]);

      const db = databaseModule.default;
      const { Model, User } = databaseModule;
      const { eq, and } = drizzleModule;
      const { runModel: directRunModel, runEmbedding: directRunEmbedding } = inferenceModule;
      const { trackModelUsage, trackUsage } = usageModule;
      const { resetDescription } = cronModule.describeCron(USAGE_RESET_SCHEDULE);

      return {
        db,
        Model,
        User,
        eq,
        and,
        directRunModel,
        directRunEmbedding,
        trackModelUsage,
        trackUsage,
        rateLimitMessage: `You have reached your allocated usage limit. Your access to the chat tool is temporarily disabled and will reset ${resetDescription}. If you need assistance or believe this is an error, please contact the Research Optimizer helpdesk at CTRIBResearchOptimizer@mail.nih.gov.`,
      };
    })();
  }

  return directRuntimePromise;
}

async function checkRateLimit(userID) {
  if (!userID) return null;
  const { db, User, eq, rateLimitMessage } = await getDirectRuntime();
  const [user] = await db.select().from(User).where(eq(User.id, userID)).limit(1);
  if (user?.budget !== null && user?.remaining !== null && user?.remaining <= 0) {
    return { error: rateLimitMessage, status: 429 };
  }
  return null;
}

function buildDirectClient() {
  return {
    async invoke({
      userID,
      model,
      messages,
      system,
      tools,
      thoughtBudget,
      stream,
      ip,
      outputConfig,
      type,
    }) {
      const limited = await checkRateLimit(userID);
      if (limited) return limited;

      const { directRunModel, trackModelUsage } = await getDirectRuntime();
      const result = await directRunModel({
        model,
        messages,
        system,
        tools,
        thoughtBudget,
        stream,
        outputConfig,
      });

      // For non-streaming responses, track usage inline
      if (!result?.stream && userID) {
        await trackModelUsage(userID, model, ip, result.usage, { type });
      }

      // For streaming, wrap to track usage on metadata
      if (result?.stream) {
        return {
          stream: (async function* () {
            for await (const message of result.stream) {
              if (message.metadata && userID) {
                await trackModelUsage(userID, model, ip, message.metadata.usage, { type });
              }
              yield message;
            }
          })(),
        };
      }

      return result;
    },

    async embed({ userID, model, content, purpose, ip, type }) {
      const limited = await checkRateLimit(userID);
      if (limited) return limited;

      const { directRunEmbedding, trackUsage } = await getDirectRuntime();
      const result = await directRunEmbedding({ model, content, purpose });

      if (userID && result.usage) {
        const usageItems = [];
        if (result.usage.inputTextTokenCount)
          usageItems.push({ quantity: result.usage.inputTextTokenCount, unit: "input_tokens" });
        if (result.usage.imageCount)
          usageItems.push({ quantity: result.usage.imageCount, unit: "images" });
        await trackUsage(userID, model, usageItems, { type: type || "embedding" });
      }

      return result;
    },

    async listModels({ type } = {}) {
      const { db, Model, eq, and } = await getDirectRuntime();
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
    async invoke({
      userID,
      model,
      messages,
      system,
      tools,
      thoughtBudget,
      stream,
      ip,
      outputConfig,
      type,
    }) {
      const response = await fetch(`${GATEWAY_URL}/api/v1/model/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userID,
          model,
          messages,
          system,
          tools,
          thoughtBudget,
          stream,
          ip,
          outputConfig,
          type,
        }),
      });

      if (response.status === 429) {
        return { error: (await response.json()).error, status: 429 };
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Gateway error: ${response.status}`);
      }

      if (stream) {
        return {
          stream: parseNdjsonStream(response.body, {
            onParseError: (error) => console.error("Error parsing stream line:", error),
          }),
        };
      }

      return response.json();
    },

    async embed({ userID, model, content, purpose, ip, type }) {
      const response = await fetch(`${GATEWAY_URL}/api/v1/model/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userID, model, content, purpose, ip, type: type || "embedding" }),
      });

      if (response.status === 429) {
        return { error: (await response.json()).error, status: 429 };
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Gateway error: ${response.status}`);
      }

      return response.json();
    },

    async listModels({ type } = {}) {
      const url = type
        ? `${GATEWAY_URL}/api/v1/models?type=${type}`
        : `${GATEWAY_URL}/api/v1/models`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Gateway error: ${response.status}`);
      }
      return response.json();
    },
  };
}

const client = GATEWAY_URL ? buildHttpClient() : buildDirectClient();

export const { invoke, embed, listModels } = client;
