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

function findSectionById(templateSection, protocolSections, usedSourceOrders) {
  if (!templateSection.templateSectionId) {
    return null;
  }

  return (
    protocolSections.find(
      (section) =>
        !usedSourceOrders.has(section.sourceOrder) &&
        section.detectedSectionId === templateSection.templateSectionId
    ) || null
  );
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

function buildMissingResult(templateSection) {
  return {
    templateSectionKey: templateSection.templateSectionKey,
    templateSectionId: templateSection.templateSectionId,
    templateSectionTitle: templateSection.templateSectionTitle,
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
    templateSectionKey: templateSection.templateSectionKey,
    templateSectionId: templateSection.templateSectionId,
    templateSectionTitle: templateSection.templateSectionTitle,
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
    const byId = findSectionById(templateSection, protocolSections, usedSourceOrders);
    if (byId) {
      usedSourceOrders.add(byId.sourceOrder);
      return buildMatchedResult(templateSection, byId, "section-id");
    }

    const byTitle = findSectionByTitle(templateSection, protocolSections, usedSourceOrders);
    if (byTitle) {
      usedSourceOrders.add(byTitle.sourceOrder);
      return buildMatchedResult(templateSection, byTitle, "title");
    }

    const byAlias = findSectionByAlias(templateSection, protocolSections, usedSourceOrders);
    if (byAlias) {
      usedSourceOrders.add(byAlias.sourceOrder);
      return buildMatchedResult(templateSection, byAlias, "alias");
    }

    const byFuzzyTitle = findSectionByFuzzyTitle(
      templateSection,
      protocolSections,
      usedSourceOrders
    );
    if (byFuzzyTitle) {
      usedSourceOrders.add(byFuzzyTitle.sourceOrder);
      return buildMatchedResult(templateSection, byFuzzyTitle, "fuzzy-title");
    }

    return buildMissingResult(templateSection);
  });
}
