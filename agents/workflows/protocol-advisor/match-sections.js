const SIMPLE_PLACEHOLDER_PATTERNS = [
  /\bTBD\b/i,
  /\bTBA\b/i,
  /\bTK\b/i,
  /\bto come\b/i,
  /\bto be determined\b/i,
  /\binsert text here\b/i,
  /\benter text\b/i,
  /<[^>\n]+>/,
  /\bxxx+\b/i,
];

function normalizeText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function findSectionByTitle(templateSection, protocolSections, usedSourceOrders) {
  return (
    protocolSections.find(
      (section) =>
        !usedSourceOrders.has(section.sourceOrder) &&
        section.normalizedTitle === templateSection.normalizedTitle
    ) || null
  );
}

function findSectionByAlias(templateSection, protocolSections, usedSourceOrders) {
  if (!templateSection.aliases.length) {
    return null;
  }

  return (
    protocolSections.find(
      (section) =>
        !usedSourceOrders.has(section.sourceOrder) &&
        templateSection.aliases.includes(section.normalizedTitle)
    ) || null
  );
}

function getTokenSet(value = "") {
  return new Set(value.split(/\s+/).filter(Boolean));
}

function findSectionByFuzzyTitle(templateSection, protocolSections, usedSourceOrders) {
  const templateTokens = getTokenSet(templateSection.normalizedTitle);
  if (!templateTokens.size) {
    return null;
  }

  const matches = protocolSections
    .filter((section) => !usedSourceOrders.has(section.sourceOrder))
    .map((section) => {
      const protocolTokens = getTokenSet(section.normalizedTitle);
      const sharedCount = Array.from(templateTokens).filter((token) =>
        protocolTokens.has(token)
      ).length;
      const score = sharedCount / Math.max(templateTokens.size, protocolTokens.size || 1);
      return { section, score };
    })
    .filter((candidate) => candidate.score >= 0.75)
    .sort((left, right) => right.score - left.score);

  if (matches.length !== 1) {
    return null;
  }

  return matches[0].section;
}

function classifyMatchedSection(match) {
  const content = normalizeText(match.rawContent);
  if (!content) {
    return {
      status: "blank",
      issues: [
        {
          type: "blank",
          message: "The required section heading is present, but the section body is empty.",
        },
      ],
    };
  }

  if (SIMPLE_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(content))) {
    return {
      status: "placeholder",
      issues: [
        {
          type: "placeholder",
          message: "The matched section still contains placeholder or drafting text.",
        },
      ],
    };
  }

  return {
    status: "ok",
    issues: [],
  };
}

function buildOptionalResult(templateSection, match = null) {
  return {
    templateSectionId: templateSection.templateSectionId,
    templateSectionTitle: templateSection.templateSectionTitle,
    templateSectionGuidanceText: templateSection.templateSectionGuidanceText || "",
    templateSectionRequired: false,
    matchStatus: match ? "matched" : "optional",
    matchedProtocolSectionId: match?.detectedSectionId || null,
    matchedProtocolSectionTitle: match?.detectedTitle || null,
    matchedProtocolSectionContent: match?.rawContent || null,
    matchedProtocolSourceOrder: match?.sourceOrder || null,
    status: "optional",
    issues: [],
    rationale: match ? "optional-match" : "optional-missing",
  };
}

function buildMissingResult(templateSection) {
  return {
    templateSectionId: templateSection.templateSectionId,
    templateSectionTitle: templateSection.templateSectionTitle,
    templateSectionGuidanceText: templateSection.templateSectionGuidanceText || "",
    templateSectionRequired: Boolean(templateSection.templateSectionRequired),
    matchStatus: "missing",
    matchedProtocolSectionId: null,
    matchedProtocolSectionTitle: null,
    matchedProtocolSectionContent: null,
    matchedProtocolSourceOrder: null,
    status: "missing",
    issues: [
      {
        type: "missing",
        message: "Required section was not found in the uploaded protocol.",
      },
    ],
    rationale: "no-match",
  };
}

function buildMatchedResult(templateSection, match, rationale) {
  const classification = classifyMatchedSection(match);

  return {
    templateSectionId: templateSection.templateSectionId,
    templateSectionTitle: templateSection.templateSectionTitle,
    templateSectionGuidanceText: templateSection.templateSectionGuidanceText || "",
    templateSectionRequired: Boolean(templateSection.templateSectionRequired),
    matchStatus: "matched",
    matchedProtocolSectionId: match.detectedSectionId,
    matchedProtocolSectionTitle: match.detectedTitle,
    matchedProtocolSectionContent: match.rawContent,
    matchedProtocolSourceOrder: match.sourceOrder,
    status: classification.status,
    issues: classification.issues,
    rationale,
  };
}

export function matchProtocolSections(ctx) {
  const templateSections = ctx.steps.extractTemplateSections;
  const protocolSections = ctx.steps.splitSections;
  const usedSourceOrders = new Set();

  return templateSections.map((templateSection) => {
    const byTitle = findSectionByTitle(templateSection, protocolSections, usedSourceOrders);
    if (byTitle) {
      usedSourceOrders.add(byTitle.sourceOrder);
      if (templateSection.templateSectionRequired === false) {
        return buildOptionalResult(templateSection, byTitle);
      }
      return buildMatchedResult(templateSection, byTitle, "title");
    }

    const byAlias = findSectionByAlias(templateSection, protocolSections, usedSourceOrders);
    if (byAlias) {
      usedSourceOrders.add(byAlias.sourceOrder);
      if (templateSection.templateSectionRequired === false) {
        return buildOptionalResult(templateSection, byAlias);
      }
      return buildMatchedResult(templateSection, byAlias, "alias");
    }

    const byFuzzyTitle = findSectionByFuzzyTitle(
      templateSection,
      protocolSections,
      usedSourceOrders
    );
    if (byFuzzyTitle) {
      usedSourceOrders.add(byFuzzyTitle.sourceOrder);
      if (templateSection.templateSectionRequired === false) {
        return buildOptionalResult(templateSection, byFuzzyTitle);
      }
      return buildMatchedResult(templateSection, byFuzzyTitle, "fuzzy-title");
    }

    if (templateSection.templateSectionRequired === false) {
      return buildOptionalResult(templateSection);
    }

    return buildMissingResult(templateSection);
  });
}
