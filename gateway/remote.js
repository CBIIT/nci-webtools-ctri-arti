import { parseNdjsonStream } from "../shared/clients/ndjson.js";

function buildQueryString(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    query.set(key, String(value));
  }
  const str = query.toString();
  return str ? `?${str}` : "";
}

async function readError(response, fallback) {
  const error = await response.json().catch(() => ({ error: response.statusText }));
  const err = new Error(error.error || fallback);
  err.status = response.status;
  if (error.code) err.code = error.code;
  throw err;
}

export function createGatewayRemote({ baseUrl, fetchImpl = fetch }) {
  return {
    async invoke(params) {
      const response = await fetchImpl(`${baseUrl}/api/v1/model/invoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(params?.requestId ? { "X-Request-Id": params.requestId } : {}),
        },
        body: JSON.stringify(params || {}),
      });

      if (response.status === 429) {
        return { error: (await response.json()).error, status: 429 };
      }

      if (!response.ok) {
        await readError(response, `Gateway error: ${response.status}`);
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
      const response = await fetchImpl(`${baseUrl}/api/v1/models${buildQueryString({ type })}`);
      if (!response.ok) {
        await readError(response, `Gateway error: ${response.status}`);
      }
      return response.json();
    },

    async listGuardrails() {
      const response = await fetchImpl(`${baseUrl}/api/v1/guardrails`);
      if (!response.ok) {
        await readError(response, `Gateway error: ${response.status}`);
      }
      return response.json();
    },

    async reconcileGuardrails({ ids } = {}) {
      const response = await fetchImpl(`${baseUrl}/api/v1/guardrails/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids?.length ? { ids } : {}),
      });
      if (!response.ok) {
        await readError(response, `Gateway error: ${response.status}`);
      }
      return response.json();
    },

    async deleteGuardrail(id) {
      const response = await fetchImpl(`${baseUrl}/api/v1/guardrails/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        await readError(response, `Gateway error: ${response.status}`);
      }
      return response.json();
    },

    async trackUsage(userID, model, usageItems, options) {
      const response = await fetchImpl(`${baseUrl}/api/v1/usage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userID, model, usageItems, options }),
      });
      if (!response.ok) {
        await readError(response, `Gateway error: ${response.status}`);
      }
      return response.json();
    },

    async trackModelUsage(userID, model, ip, usageData, options) {
      const response = await fetchImpl(`${baseUrl}/api/v1/model-usage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userID, model, ip, usageData, options }),
      });
      if (!response.ok) {
        await readError(response, `Gateway error: ${response.status}`);
      }
      return response.json();
    },
  };
}
