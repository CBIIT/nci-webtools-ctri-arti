import { DISABLED_TOOLS_CONFIG_KEY, FEATURE_LIST } from "./constants.js";

export { DISABLED_TOOLS_CONFIG_KEY, FEATURE_LIST };

const FEATURE_KEYS_LOWER = new Set(FEATURE_LIST.map((name) => name.toLowerCase()));

/**
 * Pure rule: whether a tool is enabled given the disabled value.
 * Matching is case-insensitive for tool names and db entries.
 * @param {string} toolName
 * @param {string} [disabledToolsValue] comma-separated disabled tool names from Configuration.value
 * @returns {boolean} `true` if enabled, `false` if listed as disabled
 */
export function isToolEnabledFromDisabledValue(toolName, disabledToolsValue) {
  const raw = typeof toolName === "string" ? toolName.trim() : "";
  const key = raw.toLowerCase();
  if (!key) {
    return true;
  }

  const val = (disabledToolsValue ?? "").trim();
  const disabledSet = new Set(
    val
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );

  return !disabledSet.has(key);
}
