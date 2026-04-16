import { DISABLED_TOOLS_CONFIG_KEY } from "./constants.js";

export { DISABLED_TOOLS_CONFIG_KEY };

export function getDisabledToolNamesFromConfig(disabledToolsValue) {
  const val = (disabledToolsValue ?? "").trim();
  return val
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}
