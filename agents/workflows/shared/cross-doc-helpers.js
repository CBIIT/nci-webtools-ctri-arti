import {
  normalizeLocation,
  normalizeSeverity,
  splitTextIntoSections,
} from "./contradiction-helpers.js";

function normalizeDirection(value) {
  switch (String(value || "").toLowerCase()) {
    case "consent_understates_protocol":
      return "consent_understates_protocol";
    case "consent_overstates_protocol":
      return "consent_overstates_protocol";
    case "protocol_missing_from_consent":
      return "protocol_missing_from_consent";
    case "consent_missing_from_protocol":
      return "consent_missing_from_protocol";
    case "terminology_mismatch":
      return "terminology_mismatch";
    default:
      return "other";
  }
}

function normalizeSyncIndicator(value) {
  switch (String(value || "").toLowerCase()) {
    case "protocol":
      return "protocol";
    case "consent":
      return "consent";
    default:
      return "unclear";
  }
}

export function buildCrossDocComparisonInput(parsedProtocol, parsedConsent) {
  const protocolSections = Array.isArray(parsedProtocol.sections)
    ? parsedProtocol.sections
    : splitTextIntoSections(parsedProtocol.text);
  const consentSections = Array.isArray(parsedConsent.sections)
    ? parsedConsent.sections
    : splitTextIntoSections(parsedConsent.text);

  return {
    protocol: {
      source: parsedProtocol.source,
      contentType: parsedProtocol.contentType,
      fileName: parsedProtocol.name || "",
      candidateSectionCount: protocolSections.length,
    },
    protocolSections: protocolSections.map((section) => ({
      detectedSectionId: section.detectedSectionId,
      detectedTitle: section.detectedTitle,
      sourceOrder: section.sourceOrder,
      pageStart: section.pageStart,
      rawContent: section.rawContent,
    })),
    consent: {
      source: parsedConsent.source,
      contentType: parsedConsent.contentType,
      fileName: parsedConsent.name || "",
      candidateSectionCount: consentSections.length,
    },
    consentSections: consentSections.map((section) => ({
      detectedSectionId: section.detectedSectionId,
      detectedTitle: section.detectedTitle,
      sourceOrder: section.sourceOrder,
      pageStart: section.pageStart,
      rawContent: section.rawContent,
    })),
  };
}

export function normalizeCrossDocReviewPayload(payload, { emptySummary } = {}) {
  const findings = Array.isArray(payload?.findings)
    ? payload.findings.map((finding) => ({
        category: typeof finding?.category === "string" ? finding.category : "other",
        severity: normalizeSeverity(finding?.severity),
        concept: typeof finding?.concept === "string" ? finding.concept : "",
        direction: normalizeDirection(finding?.direction),
        likelyOutOfSync: normalizeSyncIndicator(finding?.likelyOutOfSync),
        protocol: normalizeLocation(finding?.protocol, { includeFileName: true }),
        consent: normalizeLocation(finding?.consent, { includeFileName: true }),
        explanation: typeof finding?.explanation === "string" ? finding.explanation : "",
        resolutionGuidance:
          typeof finding?.resolutionGuidance === "string" ? finding.resolutionGuidance : "",
      }))
    : [];

  return {
    overallSummary:
      typeof payload?.overallSummary === "string"
        ? payload.overallSummary
        : findings.length
          ? "Potential cross-document discrepancies were identified."
          : emptySummary || "No cross-document discrepancies identified.",
    documentsAligned: findings.length === 0,
    findings,
    citations: [],
  };
}
