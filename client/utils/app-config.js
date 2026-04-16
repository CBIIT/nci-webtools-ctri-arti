import { fetchCachedJson } from "./static-data.js";

export const DEFAULT_CLIENT_CONFIG = {
  budgetLabel: "",
  budgetResetDescription: "",
  usageTypes: [],
  disabledTools: [],
};

export function getApiKeyHeaders() {
  const apiKey = new URLSearchParams(location.search).get("apiKey");
  return apiKey ? { "x-api-key": apiKey } : undefined;
}

export function fetchClientConfig() {
  return fetchCachedJson("/api/config", { headers: getApiKeyHeaders() });
}
