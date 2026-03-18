import db, { Model, User } from "database";

import { and, eq } from "drizzle-orm";
import { describeCron } from "shared/cron.js";
import {
  buildRateLimitMessage,
  isRateLimitedUser,
  normalizeEmbeddingUsageItems,
} from "shared/gateway-usage.js";

import { deleteGuardrailById, listGuardrails, reconcileGuardrails } from "./core/guardrails.js";
import { runModel, runEmbedding } from "./core/inference.js";

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

function resolveGatewayUserId(userId, userID) {
  return userId ?? userID ?? null;
}

export function createGatewayApplication({
  modelInvoker = runModel,
  embeddingInvoker = runEmbedding,
  modelUsageTracker,
  usageTracker,
} = {}) {
  if (typeof modelUsageTracker !== "function") {
    throw new Error("modelUsageTracker is required");
  }
  if (typeof usageTracker !== "function") {
    throw new Error("usageTracker is required");
  }

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
      userId,
      userID,
      model,
      type,
      messages,
      system,
      tools,
      thoughtBudget,
      stream,
      requestId,
      outputConfig,
      content,
      purpose,
      guardrailConfig,
    }) {
      userID = resolveGatewayUserId(userId, userID);
      const { limited, modelRecord } = await requirePreflight({ userID, model });
      if (limited) return limited;

      if (modelRecord.type === "embedding") {
        const result = await embeddingInvoker({ model, content, purpose });
        if (userID && result.usage) {
          const usageItems = normalizeEmbeddingUsageItems(result.usage);
          await usageTracker(userID, model, usageItems, {
            type: type || "embedding",
            requestId,
          });
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
        guardrailConfig,
      });

      if (!result?.stream) {
        if (userID) {
          await modelUsageTracker(userID, model, result.usage, {
            type,
            requestId,
            trace: result.trace,
          });
        }
        return result;
      }

      return {
        stream: (async function* () {
          for await (const message of result.stream) {
            if (message.metadata && userID) {
              await modelUsageTracker(userID, model, message.metadata.usage, {
                type,
                requestId,
                trace: message.metadata.trace,
              });
            }
            yield message;
          }
        })(),
      };
    },

    async embed({ userId, userID, model, content, purpose, type, requestId }) {
      userID = resolveGatewayUserId(userId, userID);
      const { limited } = await requirePreflight({ userID, model });
      if (limited) return limited;

      const result = await embeddingInvoker({ model, content, purpose });
      if (userID && result.usage) {
        const usageItems = normalizeEmbeddingUsageItems(result.usage);
        await usageTracker(userID, model, usageItems, {
          type: type || "embedding",
          requestId,
        });
      }
      return result;
    },

    async trackUsage(userID, model, usageItems, options) {
      return usageTracker(userID, model, usageItems, options);
    },

    async trackModelUsage(userID, model, usageData, options) {
      return modelUsageTracker(userID, model, usageData, options);
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

    listGuardrails({ ids } = {}) {
      return listGuardrails({ ids });
    },

    reconcileGuardrails({ ids } = {}) {
      return reconcileGuardrails({ ids });
    },

    deleteGuardrail(id) {
      return deleteGuardrailById(id);
    },
  };
}
