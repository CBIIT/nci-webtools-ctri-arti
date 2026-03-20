export function accumulateContent(content, chunk) {
  const { contentBlockStart, contentBlockDelta, contentBlockStop } = chunk;

  if (contentBlockStart) {
    const { contentBlockIndex, start } = contentBlockStart;
    if (start?.toolUse) {
      content[contentBlockIndex] = { toolUse: { ...start.toolUse, input: "" } };
    }
  }

  if (contentBlockDelta) {
    const { contentBlockIndex, delta } = contentBlockDelta;
    content[contentBlockIndex] ||= {};
    const block = content[contentBlockIndex];

    if (delta.reasoningContent) {
      block.reasoningContent ||= { reasoningText: {} };
      const { text, signature, redactedContent } = delta.reasoningContent;
      if (text) {
        block.reasoningContent.reasoningText.text ||= "";
        block.reasoningContent.reasoningText.text += text;
      } else if (signature) {
        block.reasoningContent.reasoningText.signature ||= "";
        block.reasoningContent.reasoningText.signature += signature;
      } else if (redactedContent) {
        block.reasoningContent.redactedContent ||= "";
        block.reasoningContent.redactedContent += redactedContent;
      }
    } else if (delta.text !== undefined) {
      block.text ||= "";
      block.text += delta.text;
    } else if (delta.toolUse) {
      block.toolUse.input ||= "";
      block.toolUse.input += delta.toolUse.input;
    }
  }

  if (contentBlockStop) {
    // Content block is complete, no additional processing needed.
  }
}

export function parseToolUseInputs(content) {
  for (const block of content) {
    if (block.toolUse && typeof block.toolUse.input === "string") {
      try {
        block.toolUse.input = JSON.parse(block.toolUse.input);
      } catch {
        // Leave as string if not valid JSON.
      }
    }
  }
}
