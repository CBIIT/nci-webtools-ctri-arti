import {
  buildQueryString,
  createStatusCodeError,
  readJsonErrorPayload,
  requestJson,
  sendJsonRequest,
} from "../shared/clients/http.js";
import { parseNdjsonStream } from "../shared/clients/ndjson.js";

function createGatewayError(response, _message, payload) {
  return createStatusCodeError(response, `Gateway error: ${response.status}`, payload);
}

export function createGatewayRemote({ baseUrl, fetchImpl = fetch }) {
  function requestGateway(path, options = {}) {
    return requestJson(fetchImpl, {
      url: `${baseUrl}${path}`,
      errorMessage: "Gateway error",
      createError: createGatewayError,
      ...options,
    });
  }

  return {
    async invoke(params) {
      const response = await sendJsonRequest(fetchImpl, {
        url: `${baseUrl}/api/v1/model/invoke`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(params?.requestId ? { "X-Request-Id": params.requestId } : {}),
        },
        body: params || {},
      });

      if (response.status === 429) {
        return { ...(await readJsonErrorPayload(response)), status: 429 };
      }

      if (!response.ok) {
        throw createStatusCodeError(
          response,
          `Gateway error: ${response.status}`,
          await readJsonErrorPayload(response)
        );
      }

      if (params?.stream) {
        return {
          stream: parseNdjsonStream(response.body, {
            onParseError: (error) => console.error("Error parsing stream line:", error),
          }),
        };
      }

      return response.json();
    },

    async embed(params) {
      const result = await this.invoke({
        ...params,
        type: params?.type || "embedding",
      });
      if (result?.stream) {
        throw new Error("Embedding requests do not support streaming responses");
      }
      return result;
    },

    async listModels({ type } = {}) {
      return requestGateway(`/api/v1/model/list${buildQueryString({ type })}`);
    },

    async listGuardrails() {
      return requestGateway("/api/v1/guardrails");
    },

    async reconcileGuardrails({ ids } = {}) {
      return requestGateway("/api/v1/guardrails/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: ids?.length ? { ids } : {},
      });
    },

    async deleteGuardrail(id) {
      return requestGateway(`/api/v1/guardrails/${id}`, { method: "DELETE" });
    },

    async trackUsage(userId, model, usageItems, options) {
      return requestGateway("/api/v1/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { userId, model, usageItems, options },
      });
    },

    async trackModelUsage(userId, model, usageData, options) {
      return requestGateway("/api/v1/model-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { userId, model, usageData, options },
      });
    },
  };
}
