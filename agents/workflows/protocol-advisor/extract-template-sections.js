import { readFileSync } from "node:fs";

import { normalizeHeading, splitTextIntoSections } from "./split-sections.js";

const EXCLUDED_NORMALIZED_TITLES = new Set(["table of contents"]);
const cachedTemplateSections = new Map();

function buildCanonicalKey(section) {
  return section.detectedSectionId || section.normalizedTitle;
}

function cleanDetectedTitle(section) {
  const title = section.detectedTitle || "";
  if (section.headingKind === "numbered") {
    return title.replace(/\s+\d+$/, "").trim();
  }
  return title.trim();
}

function normalizeSplitSection(section) {
  const detectedTitle = cleanDetectedTitle(section);
  return {
    ...section,
    detectedTitle,
    normalizedTitle: normalizeHeading(detectedTitle),
  };
}

function normalizeAliases(aliases = []) {
  return aliases.map((alias) => normalizeHeading(alias)).filter(Boolean);
}

function keepLastDuplicateSections(sections) {
  return sections.filter((section, index) => {
    const laterSections = sections.slice(index + 1);
    return !laterSections.some(
      (laterSection) =>
        (section.detectedSectionId &&
          laterSection.detectedSectionId &&
          section.detectedSectionId === laterSection.detectedSectionId) ||
        (section.normalizedTitle === laterSection.normalizedTitle &&
          (!section.detectedSectionId || !laterSection.detectedSectionId))
    );
  });
}

function isTemplateSection(section) {
  if (
    !section.detectedTitle ||
    section.headingKind === "implicit" ||
    section.headingKind === "fallback"
  ) {
    return false;
  }

  if (section.normalizedTitle.startsWith("protocol template for")) {
    return false;
  }

  return !EXCLUDED_NORMALIZED_TITLES.has(section.normalizedTitle);
}

function buildTemplateSections(selectedTemplate) {
  const templateText = readFileSync(selectedTemplate.sourcePath, "utf-8");
  const splitSections = splitTextIntoSections(templateText, {
    implicitTitle: "Template Start",
    fallbackTitle: "Template",
  });

  const sections = keepLastDuplicateSections(splitSections.map(normalizeSplitSection))
    .filter(isTemplateSection)
    .map((section, index) => {
      const aliases = normalizeAliases(
        selectedTemplate.titleAliases?.[section.normalizedTitle] || []
      );

      return {
        order: index,
        templateSectionKey: buildCanonicalKey(section),
        templateSectionId: section.detectedSectionId || null,
        templateSectionTitle: section.detectedTitle,
        normalizedTitle: section.normalizedTitle,
        aliases,
        instructionText: section.rawContent,
        headingKind: section.headingKind,
      };
    });

  return sections;
}

export async function extractTemplateSections(ctx) {
  const selectedTemplate = ctx.steps.loadAssets.selectedTemplate;

  if (!cachedTemplateSections.has(selectedTemplate.templateId)) {
    cachedTemplateSections.set(
      selectedTemplate.templateId,
      buildTemplateSections(selectedTemplate)
    );
  }

  return cachedTemplateSections.get(selectedTemplate.templateId);
}
