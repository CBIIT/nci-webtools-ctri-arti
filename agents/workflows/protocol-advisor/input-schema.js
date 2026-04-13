function hasProtocolText(input = {}) {
  return typeof input.protocolText === "string" && input.protocolText.trim().length > 0;
}

function hasConsentText(input = {}) {
  return typeof input.consentText === "string" && input.consentText.trim().length > 0;
}

function hasDocumentBytes(document = {}) {
  return !!document?.bytes;
}

function hasSingleDocument(input = {}) {
  return hasDocumentBytes(input.document);
}

function hasMultipleDocuments(input = {}) {
  return Array.isArray(input.documents) && input.documents.some((item) => hasDocumentBytes(item));
}

function hasSingleConsentDocument(input = {}) {
  return hasDocumentBytes(input.consentDocument);
}

function hasMultipleConsentDocuments(input = {}) {
  return (
    Array.isArray(input.consentDocuments) &&
    input.consentDocuments.some((item) => hasDocumentBytes(item))
  );
}

export function validateProtocolAdvisorInput(input = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("protocol_advisor input must be an object");
  }

  if (!input.templateId || typeof input.templateId !== "string") {
    throw new Error("protocol_advisor requires templateId");
  }

  const documents = Array.isArray(input.documents) ? input.documents.filter(Boolean) : [];
  if (input.documents && documents.length === 0) {
    throw new Error("protocol_advisor documents must contain at least one file when provided");
  }
  if (documents.some((document) => !hasDocumentBytes(document))) {
    throw new Error("Each protocol_advisor document must include bytes");
  }

  const consentDocuments = Array.isArray(input.consentDocuments)
    ? input.consentDocuments.filter(Boolean)
    : [];
  if (input.consentDocuments && consentDocuments.length === 0) {
    throw new Error(
      "protocol_advisor consentDocuments must contain at least one file when provided"
    );
  }
  if (consentDocuments.some((document) => !hasDocumentBytes(document))) {
    throw new Error("Each protocol_advisor consent document must include bytes");
  }

  if (!hasProtocolText(input) && !hasSingleDocument(input) && !hasMultipleDocuments(input)) {
    throw new Error("protocol_advisor requires protocolText, document.bytes, or documents[].bytes");
  }

  return {
    templateId: input.templateId.trim(),
    model: typeof input.model === "string" ? input.model.trim() || null : null,
    hasProtocolText: hasProtocolText(input),
    hasDocument: hasSingleDocument(input),
    hasDocuments: hasMultipleDocuments(input),
    documentCount: documents.length + (hasSingleDocument(input) ? 1 : 0),
    hasConsentText: hasConsentText(input),
    hasConsentDocument: hasSingleConsentDocument(input),
    hasConsentDocuments: hasMultipleConsentDocuments(input),
    consentDocumentCount: consentDocuments.length + (hasSingleConsentDocument(input) ? 1 : 0),
  };
}
