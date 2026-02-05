/**
 * Gateway Client
 *
 * Provides a unified interface for AI inference that works in both:
 * - Monolith mode (direct function calls when GATEWAY_URL is not set)
 * - Microservice mode (HTTP calls when GATEWAY_URL is set)
 */

import { Model, Usage, User } from "../database.js";
import { runModel as directRunModel } from "../gateway/inference.js";

const GATEWAY_URL = process.env.GATEWAY_URL;

/**
 * Track model usage and update user's remaining balance (for monolith mode)
 */
async function trackModelUsage(userId, modelValue, ip, usageData) {
  try {
    if (!userId || !usageData || !modelValue) return;

    const model = await Model.findOne({ where: { internalName: modelValue } });
    if (!model) return;

    const inputTokens = Math.max(0, parseInt(usageData.inputTokens) || 0);
    const outputTokens = Math.max(0, parseInt(usageData.outputTokens) || 0);
    const inputCost = (inputTokens / 1000) * (model.cost1kInput || 0);
    const outputCost = (outputTokens / 1000) * (model.cost1kOutput || 0);
    const totalCost = inputCost + outputCost;

    const usageRecord = await Usage.create({
      userId,
      modelId: model.id,
      ip,
      inputTokens,
      outputTokens,
      cost: totalCost,
    });

    if (totalCost > 0) {
      const user = await User.findByPk(userId);
      if (user && user.remaining !== null && user.limit !== null) {
        await user.update({
          remaining: Math.max(0, (user.remaining || 0) - totalCost),
        });
      }
    }

    return usageRecord;
  } catch (error) {
    console.error("Error tracking model usage:", error);
  }
}

/**
 * Run AI inference
 * @param {Object} options - Inference options
 * @param {string} options.userId - User ID for rate limiting and usage tracking
 * @param {string} options.model - Model internal name
 * @param {Array} options.messages - Messages array
 * @param {string} options.system - System prompt
 * @param {Array} options.tools - Tools array
 * @param {number} options.thoughtBudget - Token budget for thinking
 * @param {boolean} options.stream - Whether to stream the response
 * @param {string} options.ip - Client IP address
 * @returns {Promise<Object>} - Inference result or stream
 */
export async function infer({ userId, model, messages, system, tools, thoughtBudget, stream, ip }) {
  if (!GATEWAY_URL) {
    // Monolith mode: direct function calls
    if (userId) {
      const user = await User.findByPk(userId);
      if (user?.limit !== null && user?.remaining !== null && user?.remaining <= 0) {
        return {
          error:
            "You have reached your allocated weekly usage limit. Your access to the chat tool is temporarily disabled and will reset on Monday at 12:00 AM. If you need assistance or believe this is an error, please contact the Research Optimizer helpdesk at CTRIBResearchOptimizer@mail.nih.gov.",
          status: 429,
        };
      }
    }

    const result = await directRunModel({ model, messages, system, tools, thoughtBudget, stream });

    // For non-streaming responses, track usage inline
    if (!result?.stream && userId) {
      await trackModelUsage(userId, model, ip, result.usage);
    }

    // For streaming, wrap to track usage on metadata
    if (result?.stream) {
      return {
        stream: (async function* () {
          for await (const message of result.stream) {
            if (message.metadata && userId) {
              await trackModelUsage(userId, model, ip, message.metadata.usage);
            }
            yield message;
          }
        })(),
      };
    }

    return result;
  }

  // Microservice mode: HTTP call
  const response = await fetch(`${GATEWAY_URL}/api/infer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, model, messages, system, tools, thoughtBudget, stream, ip }),
  });

  if (response.status === 429) {
    return { error: (await response.json()).error, status: 429 };
  }

  if (stream) {
    // Return an async generator for streaming
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

        // Handle remaining buffer
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
}

/**
 * List available models
 * @returns {Promise<Array>} - Array of model objects
 */
export async function listModels() {
  if (!GATEWAY_URL) {
    // Monolith mode: direct database query
    return Model.findAll({
      attributes: ["name", "internalName", "maxContext", "maxOutput", "maxReasoning"],
      where: { providerId: 1 },
    });
  }

  // Microservice mode: HTTP call
  const response = await fetch(`${GATEWAY_URL}/api/models`);
  return response.json();
}
