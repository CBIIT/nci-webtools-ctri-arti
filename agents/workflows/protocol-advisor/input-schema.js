function hasProtocolText(input = {}) {
  return typeof input.protocolText === "string" && input.protocolText.trim().length > 0;
}

function hasDocumentBytes(input = {}) {
  return !!input.document?.bytes;
}

export function validateProtocolAdvisorInput(input = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("protocol_advisor input must be an object");
  }

  if (!input.templateId || typeof input.templateId !== "string") {
    throw new Error("protocol_advisor requires templateId");
  }

  if (!hasProtocolText(input) && !hasDocumentBytes(input)) {
    throw new Error("protocol_advisor requires protocolText or document.bytes");
  }

  return {
    templateId: input.templateId.trim(),
    hasProtocolText: hasProtocolText(input),
    hasDocument: hasDocumentBytes(input),
  };
}
