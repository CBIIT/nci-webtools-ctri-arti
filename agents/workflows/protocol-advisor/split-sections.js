export function normalizeHeading(value = "") {
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

export function splitTextIntoSections(
  text,
  { implicitTitle = "Document Start", fallbackTitle = "Document" } = {}
) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sections = [];
  let current = null;

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
    });
  }

  for (const line of lines) {
    const heading = detectHeading(line);
    if (heading) {
      commitCurrent();
      current = {
        ...heading,
        lines: [],
      };
      continue;
    }

    if (!current) {
      current = {
        sectionId: null,
        title: implicitTitle,
        kind: "implicit",
        lines: [],
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
        rawContent: text,
        headingKind: "fallback",
      },
    ];
  }

  return sections;
}

export function splitProtocolSections(ctx) {
  return splitTextIntoSections(ctx.steps.parseProtocol.text);
}
