import { fileURLToPath } from "node:url";

import { loadCsv } from "database/csv-loader.js";
import { desc, eq } from "drizzle-orm";

import { normalizeHeading } from "./split-sections.js";

function resolveAssetPath(relativePath) {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

const SOURCE_CSV_PATH = resolveAssetPath(
  "./assets/sources/protocol-advisor-source-content-v10.csv"
);

const TEMPLATE_MANIFEST = {
  "Behavioral & Social Science Research Protocol Template": {
    templateId: "behavioral_social_science",
    kind: "protocol_template",
    supported: true,
    sourcePath: resolveAssetPath(
      "./assets/templates/Behavioral__Social_Science_Research_Protocol_template.txt"
    ),
    titleAliases: {
      "study intervention(s) or experimental manipulation(s)": [
        "study intervention",
        "study interventions",
        "experimental manipulation",
        "experimental manipulations",
      ],
    },
  },
  "Interventional Drug and Device Clinical Trials Protocol Template": {
    templateId: "interventional",
    kind: "protocol_template",
    supported: true,
    sourcePath: resolveAssetPath(
      "./assets/templates/NIH_interventional_protocol_template_final_v9_02.04.2025.txt"
    ),
    titleAliases: {
      "study intervention(s)": ["study intervention", "study interventions"],
    },
  },
  "Natural History and Observational Trials Protocol Template": {
    templateId: "natural_history_observational",
    kind: "protocol_template",
    supported: true,
    sourcePath: resolveAssetPath(
      "./assets/templates/Natural__History_and_Observational_Trials_Protocol_Template.txt"
    ),
    titleAliases: {},
  },
  "Prospective Data Collection Protocol Template": {
    templateId: "prospective_data_collection",
    kind: "protocol_template",
    supported: true,
    sourcePath: resolveAssetPath(
      "./assets/templates/Collecting_Prospective_Data_from_Humans_Protocol_Template_30_June_2021.txt"
    ),
    titleAliases: {},
  },
  "Repository Protocol Template": {
    templateId: "repository",
    kind: "protocol_template",
    supported: true,
    sourcePath: resolveAssetPath("./assets/templates/NIH_Protocol_Template_for_Repositories.txt"),
    titleAliases: {},
  },
  "Retrospective Data or Biospecimen Review Protocol Template": {
    templateId: "retrospective_review",
    kind: "protocol_template",
    supported: true,
    sourcePath: resolveAssetPath(
      "./assets/templates/Retrospective_Data_or_Biospecimen_Review_Protocol_Template_30_June_2021.txt"
    ),
    titleAliases: {},
  },
  "Secondary Research Protocol Template": {
    templateId: "secondary_research",
    kind: "protocol_template",
    supported: true,
    sourcePath: resolveAssetPath(
      "./assets/templates/NIH_Protocol_Template_for_Secondary_Research.txt"
    ),
    titleAliases: {
      "biospecimens and or data": [
        "biospecimens and data",
        "biospecimens or data",
        "data and biospecimens",
      ],
    },
  },
};

let cachedAssets = null;

function createTemplateRecord(row) {
  const manifestEntry = TEMPLATE_MANIFEST[row.name];
  if (!manifestEntry) {
    return null;
  }

  return {
    templateId: manifestEntry.templateId,
    displayName: row.name,
    kind: manifestEntry.kind,
    supported: manifestEntry.supported,
    purpose: row.purpose,
    url: row.url,
    selectionRule: row.selection_rule || "",
    tokenCount: Number(String(row.token_count || "").replaceAll(",", "")) || null,
    sourcePath: manifestEntry.sourcePath,
    titleAliases: manifestEntry.titleAliases,
  };
}

function normalizeTemplateSection(section, titleAliases = {}) {
  const normalizedTitle = normalizeHeading(section.name);

  return {
    templateSectionId: section.id,
    templateSectionTitle: section.name,
    templateSectionGuidanceText: section.guidanceText,
    templateSectionRequired: Boolean(section.required),
    normalizedTitle,
    aliases: titleAliases[normalizedTitle] || [],
    instructionText: section.guidanceText,
    headingKind: "database",
  };
}

function buildAssets() {
  const rows = loadCsv(SOURCE_CSV_PATH);
  const templates = rows
    .filter((row) => row.purpose === "protocol template")
    .map(createTemplateRecord)
    .filter((template) => template && template.supported);

  const byId = Object.fromEntries(templates.map((template) => [template.templateId, template]));
  const references = rows
    .filter((row) => row.purpose === "reference")
    .map((row) => ({
      name: row.name,
      url: row.url,
      tokenCount: Number(String(row.token_count || "").replaceAll(",", "")) || null,
    }));

  return {
    templates,
    templateIds: templates.map((template) => template.templateId),
    byId,
    references,
  };
}

async function loadTemplateRequirements(templateId, titleAliases = {}) {
  const { default: db } = await import("database");
  const { Template, TemplateSection } = await import("database/schema.js");
  const [template] = await db
    .select()
    .from(Template)
    .where(eq(Template.canonicalID, templateId))
    .orderBy(desc(Template.version))
    .limit(1);

  if (!template) {
    return null;
  }

  const sections = await db
    .select()
    .from(TemplateSection)
    .where(eq(TemplateSection.templateID, template.id))
    .orderBy(TemplateSection.id);

  return {
    templateDbId: template.id,
    canonicalID: template.canonicalID,
    version: template.version,
    title: template.title,
    sections: sections.map((section) => normalizeTemplateSection(section, titleAliases)),
  };
}

export async function loadProtocolAdvisorAssets(ctx) {
  cachedAssets ||= buildAssets();

  const selectedTemplate = cachedAssets.byId[ctx.input.templateId];
  if (!selectedTemplate) {
    throw new Error(`Unsupported protocol_advisor templateId: ${ctx.input.templateId}`);
  }

  const templateRequirements = await loadTemplateRequirements(
    selectedTemplate.templateId,
    selectedTemplate.titleAliases
  );
  if (!templateRequirements) {
    throw new Error(
      `Missing Template requirements for protocol_advisor templateId: ${ctx.input.templateId}`
    );
  }

  return {
    ...cachedAssets,
    selectedTemplate: {
      ...selectedTemplate,
      ...templateRequirements,
    },
  };
}
