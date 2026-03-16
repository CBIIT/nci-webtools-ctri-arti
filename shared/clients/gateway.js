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
let directAppPromise;

function shouldBootstrapDirectGuardrails() {
  if (process.env.DISABLE_GUARDRAIL_BOOTSTRAP === "1") return false;
  return !process.execArgv.includes("--test");
}

async function getDirectApp() {
  if (!directAppPromise) {
    directAppPromise = (async () => {
      const { createGatewayApplication } = await import("gateway/app.js");
      const app = createGatewayApplication();
      if (shouldBootstrapDirectGuardrails()) {
        try {
          await app.reconcileGuardrails();
        } catch (error) {
          console.error("Direct gateway guardrail bootstrap failed:", error);
        }
      }
      return app;
    })();
  }

  return directAppPromise;
}

function buildDirectClient() {
  return {
    async invoke(params) {
      return (await getDirectApp()).invoke(params);
    },

    async embed(params) {
      return (await getDirectApp()).embed(params);
    },

    async listModels({ type } = {}) {
      return (await getDirectApp()).listModels({ type });
    },

    async listGuardrails() {
      return (await getDirectApp()).listGuardrails();
    },

    async reconcileGuardrails({ ids } = {}) {
      return (await getDirectApp()).reconcileGuardrails({ ids });
    },

    async deleteGuardrail(id) {
      return (await getDirectApp()).deleteGuardrail(id);
    },
  };
}

function buildHttpClient() {
  return {
    async invoke({
      userID,
      requestId,
      model,
      messages,
      system,
      tools,
      thoughtBudget,
      stream,
      ip,
      outputConfig,
      type,
      guardrailConfig,
    }) {
      const response = await fetch(`${GATEWAY_URL}/api/v1/model/invoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(requestId ? { "X-Request-Id": requestId } : {}),
        },
        body: JSON.stringify({
          userID,
          requestId,
          model,
          messages,
          system,
          tools,
          thoughtBudget,
          stream,
          ip,
          outputConfig,
          type,
          guardrailConfig,
        }),
      });

      if (response.status === 429) {
        return { error: (await response.json()).error, status: 429 };
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        const err = new Error(error.error || `Gateway error: ${response.status}`);
        err.status = response.status;
        if (error.code) err.code = error.code;
        throw err;
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

    async embed({ userID, requestId, model, content, purpose, ip, type }) {
      const response = await fetch(`${GATEWAY_URL}/api/v1/model/invoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(requestId ? { "X-Request-Id": requestId } : {}),
        },
        body: JSON.stringify({
          userID,
          requestId,
          model,
          content,
          purpose,
          ip,
          type: type || "embedding",
        }),
      });

      if (response.status === 429) {
        return { error: (await response.json()).error, status: 429 };
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        const err = new Error(error.error || `Gateway error: ${response.status}`);
        err.status = response.status;
        if (error.code) err.code = error.code;
        throw err;
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
        const err = new Error(error.error || `Gateway error: ${response.status}`);
        err.status = response.status;
        if (error.code) err.code = error.code;
        throw err;
      }
      return response.json();
    },

    async listGuardrails() {
      const response = await fetch(`${GATEWAY_URL}/api/v1/guardrails`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        const err = new Error(error.error || `Gateway error: ${response.status}`);
        err.status = response.status;
        throw err;
      }
      return response.json();
    },

    async reconcileGuardrails({ ids } = {}) {
      const response = await fetch(`${GATEWAY_URL}/api/v1/guardrails/reconcile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ids?.length ? { ids } : {}),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        const err = new Error(error.error || `Gateway error: ${response.status}`);
        err.status = response.status;
        throw err;
      }
      return response.json();
    },

    async deleteGuardrail(id) {
      const response = await fetch(`${GATEWAY_URL}/api/v1/guardrails/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        const err = new Error(error.error || `Gateway error: ${response.status}`);
        err.status = response.status;
        throw err;
      }
      return response.json();
    },
  };
}

const client = GATEWAY_URL ? buildHttpClient() : buildDirectClient();

export const { invoke, embed, listModels, listGuardrails, reconcileGuardrails, deleteGuardrail } =
  client;
