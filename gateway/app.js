import db, { Model, Provider, User } from "database";

import { and, asc, eq, or } from "drizzle-orm";
import { describeCron } from "shared/cron.js";
import {
  buildRateLimitMessage,
  isRateLimitedUser,
  normalizeEmbeddingUsageItems,
} from "shared/gateway-usage.js";

import { deleteGuardrailById, listGuardrails, reconcileGuardrails } from "./core/guardrails.js";
import { runEmbedding, runModel } from "./core/inference.js";

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

async function getRateLimitResponse(userId) {
  if (!userId) return null;
  const [user] = await db.select().from(User).where(eq(User.id, userId)).limit(1);
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
  modelUsageTracker,
  usageTracker,
} = {}) {
  if (typeof modelUsageTracker !== "function") {
    throw new Error("modelUsageTracker is required");
  }
  if (typeof usageTracker !== "function") {
    throw new Error("usageTracker is required");
  }

  async function requirePreflight({ userId, model }) {
    const modelRecord = await getModelRecord(model);
    if (!modelRecord) {
      throw createGatewayError(404, "Model not found", "GATEWAY_MODEL_NOT_FOUND");
    }

    const limited = await getRateLimitResponse(userId);
    if (limited) {
      return { limited, modelRecord };
    }

    return { limited: null, modelRecord };
  }

  return {
    async invoke({
      userId,
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
      const { limited, modelRecord } = await requirePreflight({ userId, model });
      if (limited) return limited;

      if (modelRecord.type === "embedding") {
        const result = await embeddingInvoker({ model, content, purpose });
        if (userId && result.usage) {
          const usageItems = normalizeEmbeddingUsageItems(result.usage);
          await usageTracker(userId, model, usageItems, {
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
        if (userId) {
          await modelUsageTracker(userId, model, result.usage, {
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
            if (message.metadata && userId) {
              await modelUsageTracker(userId, model, message.metadata.usage, {
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

    async embed({ userId, model, content, purpose, type, requestId }) {
      const { limited } = await requirePreflight({ userId, model });
      if (limited) return limited;

      const result = await embeddingInvoker({ model, content, purpose });
      if (userId && result.usage) {
        const usageItems = normalizeEmbeddingUsageItems(result.usage);
        await usageTracker(userId, model, usageItems, {
          type: type || "embedding",
          requestId,
        });
      }
      return result;
    },

    async trackUsage(userId, model, usageItems, options) {
      return usageTracker(userId, model, usageItems, options);
    },

    async trackModelUsage(userId, model, usageData, options) {
      return modelUsageTracker(userId, model, usageData, options);
    },

    listModels({ type } = {}) {
      const where = [or(eq(Model.providerID, 1), eq(Model.providerID, 3))];
      if (type) where.push(eq(Model.type, type));

      return db
        .select({
          name: Model.name,
          internalName: Model.internalName,
          type: Model.type,
          maxContext: Model.maxContext,
          maxOutput: Model.maxOutput,
          maxReasoning: Model.maxReasoning,
          providerID: Model.providerID,
          providerName: Provider.name,
        })
        .from(Model)
        .leftJoin(Provider, eq(Model.providerID, Provider.id))
        .where(and(...where))
        .orderBy(asc(Model.providerID), asc(Model.id));
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
