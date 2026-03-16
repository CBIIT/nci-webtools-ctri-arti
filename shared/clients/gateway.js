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

async function getDirectApp() {
  if (!directAppPromise) {
    directAppPromise = (async () => {
      const { createGatewayApplication } = await import("gateway/app.js");
      return createGatewayApplication();
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
  };
}

const client = GATEWAY_URL ? buildHttpClient() : buildDirectClient();

export const { invoke, embed, listModels } = client;
