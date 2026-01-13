// Function to load prompt text from file
export async function loadPrompt(filepath) {
  try {
    const response = await fetch(filepath);
    if (!response.ok) {
      throw new Error(`Failed to fetch prompt from ${filepath}: ${response.statusText}`);
    }
    const text = await response.text();
    return text;
  } catch (error) {
    console.error(`Error loading prompt from ${filepath}:`, error);
    throw error;
  }
}

// Template configuration for all consent forms and lay person abstracts
export const templateConfigs = {
  "nih-cc-adult-patient": {
    label: "Adult affected patient",
    prefix: "NIH CCC",
    category: "NIH Clinical Center Consent (NIH CCC)",
    templateUrl: "/templates/nih-cc/nih-cc-consent-template-2024-04-15.docx",
    promptUrl: "/templates/nih-cc/adult-affected-patient.txt",
    filename: "nih-cc-consent-adult-affected.docx",
    disabled: false,
  },
  // NIH Clinical Center Consent Forms
  "nih-cc-adult-healthy": {
    label: "Adult healthy volunteer",
    prefix: "NIH CCC",
    category: "NIH Clinical Center Consent (NIH CCC)",
    templateUrl: "/templates/nih-cc/nih-cc-consent-template-2024-04-15.docx",
    promptUrl: "/templates/nih-cc/adult-healthy-volunteer.txt",
    filename: "nih-cc-consent-adult-healthy.docx",
    disabled: false,
  },
  "nih-cc-adult-family": {
    label: "Adult family member",
    prefix: "NIH CCC",
    category: "NIH Clinical Center Consent (NIH CCC)",
    templateUrl: "/templates/nih-cc/nih-cc-consent-template-2024-04-15.docx",
    promptUrl: "/templates/nih-cc/adult-family-member.txt",
    filename: "nih-cc-consent-adult-family.docx",
    disabled: false,
  },
  "nih-cc-child-assent": {
    label: "Child or cognitive impairment patient",
    prefix: "NIH CCA",
    category: "NIH Clinical Center Assent (NIH CCA)",
    templateUrl: "/templates/nih-cc/nih-cc-consent-template-2024-04-15.docx", // Would be different assent template in future
    promptUrl: "/templates/nih-cc/adult-healthy-volunteer.txt", // Placeholder - would be different assent prompt
    filename: "nih-assent-child.docx",
    disabled: true,
  },

  // Lay Person Abstract Templates
  "lpa-adult-patient": {
    label: "Adult affected patient",
    prefix: "LPA",
    category: "Lay Person Abstract (LPA)",
    templateUrl: "/templates/lay-person-abstract/lay-person-abstract-template.docx",
    promptUrl: "/templates/lay-person-abstract/adult-affected-patient.txt",
    filename: "lay-person-abstract-patient.docx",
    disabled: false,
  },
  "lpa-adult-healthy": {
    label: "Adult healthy volunteer",
    prefix: "LPA",
    category: "Lay Person Abstract (LPA)",
    templateUrl: "/templates/lay-person-abstract/lay-person-abstract-template.docx",
    promptUrl: "/templates/lay-person-abstract/adult-healthy-volunteer.txt",
    filename: "lay-person-abstract-healthy.docx",
    disabled: false,
  },
  "lpa-adult-family": {
    label: "Adult family member",
    prefix: "LPA",
    category: "Lay Person Abstract (LPA)",
    templateUrl: "/templates/lay-person-abstract/lay-person-abstract-template.docx",
    promptUrl: "/templates/lay-person-abstract/adult-family-member.txt",
    filename: "lay-person-abstract-family.docx",
    disabled: false,
  },
};

// Get prompt text for a specific template
export async function getPrompt(templateId) {
  const config = templateConfigs[templateId];
  if (!config) {
    throw new Error(`Template configuration not found for: ${templateId}`);
  }

  return await loadPrompt(config.promptUrl);
}

// Get template file URL for a specific template
export function getTemplateUrl(templateId) {
  const config = templateConfigs[templateId];
  if (!config) {
    throw new Error(`Template configuration not found for: ${templateId}`);
  }

  return config.templateUrl;
}

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
