import db, { Model, User } from "database";

import { and, eq } from "drizzle-orm";
import { describeCron } from "shared/cron.js";
import {
  buildRateLimitMessage,
  isRateLimitedUser,
  normalizeEmbeddingUsageItems,
} from "shared/gateway-usage.js";

import { runModel, runEmbedding } from "./inference.js";
import { trackModelUsage, trackUsage } from "./usage.js";

const USAGE_RESET_SCHEDULE = process.env.USAGE_RESET_SCHEDULE || "0 0 * * *";
const { resetDescription } = describeCron(USAGE_RESET_SCHEDULE);

function createGatewayError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

async function getModelRecord(modelValue) {
  const [modelRecord] = modelValue
    ? await db.select().from(Model).where(eq(Model.internalName, modelValue)).limit(1)
    : [null];
  return modelRecord || null;
}

async function getRateLimitResponse(userID) {
  if (!userID) return null;
  const [user] = await db.select().from(User).where(eq(User.id, userID)).limit(1);
  if (!isRateLimitedUser(user)) return null;

  return {
    error: buildRateLimitMessage(resetDescription),
    status: 429,
    code: "GATEWAY_RATE_LIMITED",
  };
}

export function createGatewayApplication({
  modelInvoker = runModel,
  embeddingInvoker = runEmbedding,
  modelUsageTracker = trackModelUsage,
  usageTracker = trackUsage,
} = {}) {
  async function requirePreflight({ userID, model }) {
    const modelRecord = await getModelRecord(model);
    if (!modelRecord) {
      throw createGatewayError(404, "Model not found", "GATEWAY_MODEL_NOT_FOUND");
    }

    const limited = await getRateLimitResponse(userID);
    if (limited) {
      return { limited, modelRecord };
    }

    return { limited: null, modelRecord };
  }

  return {
    async invoke({
      userID,
      model,
      type,
      messages,
      system,
      tools,
      thoughtBudget,
      stream,
      ip,
      outputConfig,
      content,
      purpose,
    }) {
      const { limited, modelRecord } = await requirePreflight({ userID, model });
      if (limited) return limited;

      if (modelRecord.type === "embedding") {
        const result = await embeddingInvoker({ model, content, purpose });
        if (userID && result.usage) {
          const usageItems = normalizeEmbeddingUsageItems(result.usage);
          await usageTracker(userID, model, usageItems, { type: type || "embedding" });
        }
        return result;
      }

      const result = await modelInvoker({
        model,
        messages,
        system,
        tools,
        thoughtBudget,
        stream,
        outputConfig,
      });

      if (!result?.stream) {
        if (userID) {
          await modelUsageTracker(userID, model, ip, result.usage, { type });
        }
        return result;
      }

      return {
        stream: (async function* () {
          for await (const message of result.stream) {
            if (message.metadata && userID) {
              await modelUsageTracker(userID, model, ip, message.metadata.usage, { type });
            }
            yield message;
          }
        })(),
      };
    },

    async embed({ userID, model, content, purpose, ip, type }) {
      const { limited } = await requirePreflight({ userID, model });
      if (limited) return limited;

      const result = await embeddingInvoker({ model, content, purpose });
      if (userID && result.usage) {
        const usageItems = normalizeEmbeddingUsageItems(result.usage);
        await usageTracker(userID, model, usageItems, { type: type || "embedding" });
      }
      return result;
    },

    listModels({ type } = {}) {
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
