function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function validateUserMessageContent(content) {
  if (!Array.isArray(content)) {
    throw createValidationError("Message content must be an array");
  }

  let hasToolUse = false;
  let hasToolResult = false;
  for (const block of content) {
    if (block?.toolUse) hasToolUse = true;
    if (block?.toolResult) hasToolResult = true;
  }

  if (hasToolUse && hasToolResult) {
    throw createValidationError("A single message cannot contain both tool uses and tool results");
  }
  if (hasToolUse) {
    throw createValidationError("User messages cannot contain tool uses");
  }
}
