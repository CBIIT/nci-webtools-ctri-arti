// Template configuration for all consent forms and lay person abstracts
export const templateConfigs = {
  // NIH Clinical Center Consent Forms
  "nih-cc-adult-patient": {
    label: "Adult affected patient",
    prefix: "NIH CCC",
    category: "NIH Clinical Center Consent (NIH CCC)",
    templateUrl: "/templates/nih-cc/template-v14-final.docx",
    libraryUrl: "/templates/nih-cc/consent-library.txt",
    promptUrl: "/templates/nih-cc/prompt-v3.txt",
    schemaUrl: "/templates/nih-cc/consent-schema.json",
    pipeline: "field-extraction",
    filename: "nih-cc-consent-adult-affected.docx",
    disabled: false,
  },
  "nih-cc-adult-healthy": {
    label: "Adult healthy volunteer",
    prefix: "NIH CCC",
    category: "NIH Clinical Center Consent (NIH CCC)",
    templateUrl: "/templates/nih-cc/template-v14-final.docx",
    libraryUrl: "/templates/nih-cc/consent-library.txt",
    promptUrl: "/templates/nih-cc/prompt-v3.txt",
    schemaUrl: "/templates/nih-cc/consent-schema.json",
    pipeline: "field-extraction",
    filename: "nih-cc-consent-adult-healthy.docx",
    disabled: false,
  },
  "nih-cc-adult-family": {
    label: "Adult family member",
    prefix: "NIH CCC",
    category: "NIH Clinical Center Consent (NIH CCC)",
    templateUrl: "/templates/nih-cc/template-v14-final.docx",
    libraryUrl: "/templates/nih-cc/consent-library.txt",
    promptUrl: "/templates/nih-cc/prompt-v3.txt",
    schemaUrl: "/templates/nih-cc/consent-schema.json",
    pipeline: "field-extraction",
    filename: "nih-cc-consent-adult-family.docx",
    disabled: false,
  },
  "nih-cc-child-assent": {
    label: "Child or cognitive impairment patient",
    prefix: "NIH CCA",
    category: "NIH Clinical Center Assent (NIH CCA)",
    templateUrl: "/templates/nih-cc/template-v14-final.docx",
    libraryUrl: "/templates/nih-cc/consent-library.txt",
    promptUrl: "/templates/nih-cc/prompt-v3.txt",
    schemaUrl: "/templates/nih-cc/consent-schema.json",
    pipeline: "field-extraction",
    filename: "nih-assent-child.docx",
    disabled: true,
  },

  // Lay Person Abstract Templates (no library needed)
  "lpa-adult-patient": {
    label: "Adult affected patient",
    prefix: "LPA",
    category: "Lay Person Abstract (LPA)",
    templateUrl: "/templates/lay-person-abstract/lay-person-abstract-template.docx",
    libraryUrl: null, // LPA doesn't use consent library
    filename: "lay-person-abstract-patient.docx",
    disabled: false,
  },
  "lpa-adult-healthy": {
    label: "Adult healthy volunteer",
    prefix: "LPA",
    category: "Lay Person Abstract (LPA)",
    templateUrl: "/templates/lay-person-abstract/lay-person-abstract-template.docx",
    libraryUrl: null,
    filename: "lay-person-abstract-healthy.docx",
    disabled: false,
  },
  "lpa-adult-family": {
    label: "Adult family member",
    prefix: "LPA",
    category: "Lay Person Abstract (LPA)",
    templateUrl: "/templates/lay-person-abstract/lay-person-abstract-template.docx",
    libraryUrl: null,
    filename: "lay-person-abstract-family.docx",
    disabled: false,
  },
};

// Get all template configurations
export function getAllTemplateConfigs() {
  return templateConfigs;
}

// Get template configurations grouped by category
export function getTemplateConfigsByCategory() {
  const groups = {};

  Object.entries(templateConfigs).forEach(([id, config]) => {
    const category = config.category || "Other";
    if (!groups[category]) {
      groups[category] = { label: category, options: [] };
    }
    groups[category].options.push({
      value: id,
      disabled: config.disabled === true,
    });
  });

  return Object.values(groups);
}
