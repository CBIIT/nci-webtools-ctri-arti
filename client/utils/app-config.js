export const APP_NAMES = {
  CHAT: "Chat",
  CONSENT_CRAFTER: "Consent Crafter",
  TRANSLATE: "Translate",
};

import { fetchCachedJson } from "./static-data.js";

export const DEFAULT_CLIENT_CONFIG = {
  budgetLabel: "",
  budgetResetDescription: "",
  disabled: [APP_NAMES.CHAT, APP_NAMES.CONSENT_CRAFTER, APP_NAMES.TRANSLATE],
  usageTypes: [],
};

export function getApiKeyHeaders() {
  const apiKey = new URLSearchParams(location.search).get("apiKey");
  return apiKey ? { "x-api-key": apiKey } : undefined;
}

export function fetchClientConfig() {
  return fetchCachedJson("/api/config", { headers: getApiKeyHeaders() });
}

export function getDisabledApps(config) {
  return Array.isArray(config?.disabled) ? config.disabled : DEFAULT_CLIENT_CONFIG.disabled;
}

export function isAppDisabled(config, appName) {
  return getDisabledApps(config).includes(appName);
}
