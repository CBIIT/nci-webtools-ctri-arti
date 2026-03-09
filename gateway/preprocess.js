/**
 * Message validation and normalization.
 *
 * Prepares raw messages for provider consumption: filters nulls,
 * ensures non-empty content, strips reasoning when disabled,
 * converts base64 bytes, and interleaves missing tool results.
 */

/**
 * Validate and normalize a messages array for inference.
 * @param {Array} messages - Raw message objects from the client
 * @param {number} thoughtBudget - Token budget for thinking (0 = strip reasoning)
 * @returns {Array} Cleaned messages ready for the provider
 */
export function processMessages(messages, thoughtBudget) {
  messages = messages.filter(Boolean);
  for (const message of messages) {
    if (!message.content.filter(Boolean).length) {
      message.content.push({ text: "_" });
    }
    const contents = message.content.filter((c) => {
      if (thoughtBudget <= 0 && c.reasoningContent) {
        return false;
      }
      return !!c;
    });
    for (const content of contents) {
      if (!content) continue;
      // prevent empty text content
      if (content.text?.trim().length === 0) {
        content.text = "_";
      }
      // transform base64 encoded bytes to Uint8Array
      const source = content.document?.source || content.image?.source;
      if (source?.bytes && typeof source.bytes === "string") {
        source.bytes = Uint8Array.from(Buffer.from(source.bytes, "base64"));
      }
      // ensure tool call inputs are in the correct format
      if (content.toolUse) {
        const toolUseId = content.toolUse.toolUseId;
        if (typeof content.toolUse.input === "string") {
          content.toolUse.input = { text: content.toolUse.input };
        }
        // if tool results don't exist, interleave an empty result
        if (!messages.find((m) => m.content.find((c) => c.toolResult?.toolUseId === toolUseId))) {
          const toolResultsIndex = messages.indexOf(message) + 1;
          const content = [{ json: { results: {} } }];
          const toolResult = { toolUseId, content };
          const toolResultsMessage = { role: "user", content: [{ toolResult }] };
          messages.splice(toolResultsIndex, 0, toolResultsMessage);
        }
      }
    }
  }
  return messages;
}
