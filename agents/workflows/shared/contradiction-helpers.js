function normalizeHeading(value = "") {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseNumberedHeading(line) {
  const match = line.match(/^(\d+(?:\.\d+)*)(?:[.)])?\s+(.+)$/);
  if (!match) {
    return null;
  }

  return {
    sectionId: match[1],
    title: match[2].trim(),
    kind: "numbered",
  };
}

function parseUppercaseHeading(line) {
  const cleaned = line.replace(/[0-9]/g, "").trim();
  const alphaChars = cleaned.replace(/[^A-Za-z]/g, "");
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (alphaChars.length < 6 || words.length < 2 || line.length > 120) {
    return null;
  }
  if (cleaned !== cleaned.toUpperCase()) {
    return null;
  }

  return {
    sectionId: null,
    title: cleaned,
    kind: "uppercase",
  };
}

function detectHeading(line) {
  return parseNumberedHeading(line) || parseUppercaseHeading(line);
}

function parsePageMarker(line) {
  const match = line.match(/^Page\s+(\d+)\s*:/);
  return match ? Number(match[1]) : null;
}

export function splitTextIntoSections(
  text,
  { implicitTitle = "Document Start", fallbackTitle = "Document" } = {}
) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sections = [];
  let current = null;
  let currentPage = null;

  function commitCurrent() {
    if (!current) {
      return;
    }
    sections.push({
      sourceOrder: sections.length,
      detectedSectionId: current.sectionId,
      detectedTitle: current.title,
      normalizedTitle: normalizeHeading(current.title),
      rawContent: current.lines.join("\n").trim(),
      headingKind: current.kind,
      pageStart: current.pageStart,
    });
  }

  for (const line of lines) {
    const page = parsePageMarker(line);
    if (page !== null) {
      currentPage = page;
      continue;
    }

    const heading = detectHeading(line);
    if (heading) {
      commitCurrent();
      current = {
        ...heading,
        lines: [],
        pageStart: currentPage,
      };
      continue;
    }

    if (!current) {
      current = {
        sectionId: null,
        title: implicitTitle,
        kind: "implicit",
        lines: [],
        pageStart: currentPage,
      };
    }
    current.lines.push(line);
  }

  commitCurrent();

  if (!sections.length) {
    return [
      {
        sourceOrder: 0,
        detectedSectionId: null,
        detectedTitle: fallbackTitle,
        normalizedTitle: normalizeHeading(fallbackTitle),
        rawContent: String(text || "").trim(),
        headingKind: "fallback",
        pageStart: null,
      },
    ];
  }

  return sections;
}

export function normalizeSeverity(value) {
  switch (String(value || "").toLowerCase()) {
    case "high":
      return "high";
    case "low":
      return "low";
    default:
      return "medium";
  }
}

export function normalizeLocation(location, { includeFileName = false } = {}) {
  return {
    ...(includeFileName
      ? {
          fileName: typeof location?.fileName === "string" ? location.fileName : "",
        }
      : {}),
    sectionTitle: typeof location?.sectionTitle === "string" ? location.sectionTitle : "",
    sectionId: typeof location?.sectionId === "string" ? location.sectionId : "",
    page: typeof location?.page === "number" ? location.page : null,
    quote: typeof location?.quote === "string" ? location.quote : "",
  };
}

export function normalizeContradictionReviewPayload(payload, { emptySummary } = {}) {
  const findings = Array.isArray(payload?.findings)
    ? payload.findings.map((finding) => ({
        category: typeof finding?.category === "string" ? finding.category : "other",
        severity: normalizeSeverity(finding?.severity),
        concept: typeof finding?.concept === "string" ? finding.concept : "",
        sectionA: normalizeLocation(finding?.sectionA),
        sectionB: normalizeLocation(finding?.sectionB),
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
          ? "Potential contradictions were identified across document sections."
          : emptySummary || "No contradictions identified.",
    documentClean: findings.length === 0,
    findings,
    citations: [],
  };
}

export function buildContradictionReviewInput(parsedDocument) {
  const sections = Array.isArray(parsedDocument.sections)
    ? parsedDocument.sections
    : splitTextIntoSections(parsedDocument.text);
  return {
    document: {
      source: parsedDocument.source,
      contentType: parsedDocument.contentType,
      candidateSectionCount: sections.length,
    },
    sections: sections.map((section) => ({
      detectedSectionId: section.detectedSectionId,
      detectedTitle: section.detectedTitle,
      sourceOrder: section.sourceOrder,
      pageStart: section.pageStart,
      rawContent: section.rawContent,
    })),
  };
}
