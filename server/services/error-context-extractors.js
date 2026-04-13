/**
 * Extract context information from requests for error reporting.
 *
 * @param {object} request - Request object
 * @returns {Array<{label: string, value: any}>} Array of metadata objects for error context
 */
function extractChatContext(request) {
  const body = request.body || {};
  const isFedPulse = request.headers?.referer?.includes("fedpulse=1") || false;
  const model = body.model || "N/A";
  const reasoningMode = !isNaN(body.thoughtBudget) ? body.thoughtBudget > 0 : "N/A";
  const chatId = body.conversationId || request.query?.id || "N/A";

  const lastMessages = Array.isArray(body.messages)
    ? body.messages.slice(-3).map((m) => ({
        role: m.role,
        preview: m.content?.[0]?.text || "N/A",
      }))
    : [];

  return [
    { label: "Tool Name", value: isFedPulse ? "FedPulse" : "Chat" },
    { label: "Chat ID", value: chatId },
    { label: "Reasoning Mode", value: reasoningMode },
    { label: "Model", value: model },
    { label: "Last 3 chat messages", value: lastMessages },
  ];
}

/**
 * Extract context for translate tool errors
 */
function extractTranslateContext(request) {
  const body = request.body || {};

  let engine = "N/A";
  if (body.model) {
    engine = body.model;
  } else if (request.path?.includes("/translate")) {
    engine = "AWS Translate";
  }

  return [
    { label: "Tool Name", value: "Translator" },
    { label: "Engine", value: engine },
    { label: "Target Language", value: body.targetLanguage || "N/A" },
  ];
}

/**
 * Extract context for users admin page errors
 */
function extractUsersContext(request) {
  const query = request.query || {};
  const body = request.body || {};

  return [
    { label: "Tool Name", value: "Users Admin" },
    { label: "Search Query", value: query.search || body.search || "N/A" },
    { label: "Selected Role", value: query.roleID || body.roleID || "N/A" },
    { label: "Selected Status", value: query.status || body.status || "N/A" },
    { label: "Current Page", value: parseInt(query.page || body.page, 10) || "N/A" },
    { label: "Sort Column", value: query.sortBy || body.sortBy || "N/A" },
    { label: "Sort Order", value: query.sortOrder || body.sortOrder || "N/A" },
    { label: "Total Users", value: body.total || query.total || "N/A" },
  ];
}

/**
 * Extract context for usage analytics page errors
 */
function extractUsageContext(request) {
  const query = request.query || {};
  const body = request.body || {};

  return [
    { label: "Tool Name", value: "Usage Analytics" },
    { label: "Date Range", value: query.dateRange || body.dateRange || "N/A" },
    { label: "Start Date", value: query.startDate || body.startDate || "N/A" },
    { label: "End Date", value: query.endDate || body.endDate || "N/A" },
    { label: "User Search Query", value: query.search || body.search || "N/A" },
    { label: "Selected Role", value: query.roleID || body.roleID || "N/A" },
    { label: "Selected Status", value: query.status || body.status || "N/A" },
    { label: "Current Page", value: parseInt(query.page || body.page, 10) || "N/A" },
    { label: "Sort Column", value: query.sortBy || body.sortBy || "N/A" },
    { label: "Sort Order", value: query.sortOrder || body.sortOrder || "N/A" },
    { label: "Total Records", value: body.total || query.total || "N/A" },
  ];
}

/**
 * Extract context for conversation-related errors
 */
function extractConversationsContext(request) {
  const query = request.query || {};
  const body = request.body || {};

  return [
    { label: "Tool Name", value: "Conversations" },
    { label: "Conversation ID", value: request.params?.id || query.id || body.id || "N/A" },
    { label: "Action", value: request.method },
  ];
}

/**
 * Extract context for consent crafter errors
 */
function extractConsentCrafterContext(request) {
  const body = request.body || {};

  return [
    { label: "Tool Name", value: "Consent Crafter" },
    { label: "Model", value: body.model || "N/A" },
    { label: "Template Name", value: body.templateName || "N/A" },
  ];
}

/**
 * Registry mapping route patterns to context extractors.
 */
const extractorRegistry = [
  { pattern: /\/chat/, extractor: extractChatContext },
  { pattern: /\/model/, extractor: extractChatContext },
  { pattern: /\/translate/, extractor: extractTranslateContext },
  { pattern: /\/admin\/users/, extractor: extractUsersContext },
  { pattern: /\/admin\/analytics/, extractor: extractUsageContext },
  { pattern: /\/conversations/, extractor: extractConversationsContext },
];

/**
 * Extract tool-specific context from request.
 *
 * @param {object} request - Request object
 * @returns {Array<{label: string, value: any}>} Tool-specific metadata
 */
export function extractToolContext(request) {
  const path = request.path || "";

  if (request.body?.type === "chat") {
    return extractChatContext(request);
  }

  if (request.body?.type === "consent-crafter") {
    return extractConsentCrafterContext(request);
  }

  // Find matching extractor based on path
  for (const { pattern, extractor } of extractorRegistry) {
    if (pattern.test(path)) {
      return extractor(request);
    }
  }

  const pathMatch = path.match(/^\/api\/v\d+\/(?:tools\/)?([^/]+)/);
  const toolName = pathMatch?.[1] || "Unknown";

  return [{ label: "Tool Name", value: toolName }];
}
