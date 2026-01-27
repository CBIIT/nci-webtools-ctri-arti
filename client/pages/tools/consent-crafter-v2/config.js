// Key groups for chunked extraction (grouped by topic for better extraction quality)
// Note: The new schema uses nested objects for complex fields like Phase_Trial, Study_Design_Explanation, etc.
// These nested objects are extracted as single fields - the AI will populate the nested structure.
export const KEY_GROUPS = [
  // Group 1: Basic Study Info & Contacts (11 keys)
  [
    "references",
    "PI",
    "Title",
    "Study_Site",
    "Cohort",
    "Contact_Name",
    "Contact_Email",
    "Contact_Phone",
    "Other_Contact_Name",
    "Other_Contact_Email",
    "Other_Contact_Phone",
  ],
  // Group 2: Study Overview (10 keys)
  [
    "Why_Asked",
    "Study_Purpose",
    "Disease_Condition",
    "Phase_Trial",
    "FDA_Approval_Status",
    "Brief_Happenings",
    "Brief_Risks",
    "Brief_Alternatives",
    "Responsibilities",
    "Brief_Benefits",
  ],
  // Group 3: Study Details & Timeline (10 keys)
  [
    "Voluntariness",
    "Parent_Permission",
    "Impaired_Adults",
    "How_Long",
    "How_Many",
    "Introduction",
    "Study_Design_Explanation",
    "Before_You_Begin",
    "During_The_Study",
    "Follow_Up",
  ],
  // Group 4: Drug & Procedure Risks (4 keys)
  [
    "Study_Drug_Risks",
    "Risks_Discomforts",
    "Radiation_Risks",
    "Pregnancy_Risks",
  ],
  // Group 5: Benefits, Alternatives & Results (5 keys)
  [
    "Potential_Benefits_You",
    "Potential_Benefits_Others",
    "Other_Options",
    "Return_Results",
    "Early_Withdrawal",
  ],
  // Group 6: Data & Specimens (6 keys)
  [
    "Data_Saved",
    "Data_Shared_Deidentified",
    "Data_Shared_Identified",
    "Genomic_Sensitivity",
    "Anonymized_Specimen_Sharing",
    "Specimen_Storage",
  ],
  // Group 7: Financial Information (3 keys)
  [
    "Payment_Information",
    "Reimbursement_Information",
    "Costs",
  ],
  // Group 8: Confidentiality & Legal (6 keys)
  [
    "Confidentiality",
    "Confidentiality_Study_Sponsor",
    "Confidentiality_Manufacturer",
    "Confidentiality_Drug_Device",
    "Conflict_Of_Interest_Information",
    "Clinical_Trial_Agreement_Information",
    "COVID_PREP_Act_Language",
  ],
];

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
  // NIH Clinical Center Consent Forms (procedure library is embedded in prompts)
  "nih-cc-adult-patient": {
    label: "Adult affected patient",
    prefix: "NIH CCC",
    category: "NIH Clinical Center Consent (NIH CCC)",
    templateUrl: "/templates/nih-cc/nih-cc-consent-template-2024-04-15.docx",
    promptUrl: "/templates/nih-cc/adult-affected-patient.txt",
    schemaUrl: "/templates/nih-cc/adult-affected-patient.json",
    procedureLibraryUrl: null, // Procedure library is embedded in prompts
    filename: "nih-cc-consent-adult-affected.docx",
    disabled: false,
  },
  "nih-cc-adult-healthy": {
    label: "Adult healthy volunteer",
    prefix: "NIH CCC",
    category: "NIH Clinical Center Consent (NIH CCC)",
    templateUrl: "/templates/nih-cc/nih-cc-consent-template-2024-04-15.docx",
    promptUrl: "/templates/nih-cc/adult-healthy-volunteer.txt",
    schemaUrl: "/templates/nih-cc/adult-healthy-volunteer.json",
    procedureLibraryUrl: null, // Procedure library is embedded in prompts
    filename: "nih-cc-consent-adult-healthy.docx",
    disabled: false,
  },
  "nih-cc-adult-family": {
    label: "Adult family member",
    prefix: "NIH CCC",
    category: "NIH Clinical Center Consent (NIH CCC)",
    templateUrl: "/templates/nih-cc/nih-cc-consent-template-2024-04-15.docx",
    promptUrl: "/templates/nih-cc/adult-family-member.txt",
    schemaUrl: "/templates/nih-cc/adult-family-member.json",
    procedureLibraryUrl: null, // Procedure library is embedded in prompts
    filename: "nih-cc-consent-adult-family.docx",
    disabled: false,
  },
  "nih-cc-child-assent": {
    label: "Child or cognitive impairment patient",
    prefix: "NIH CCA",
    category: "NIH Clinical Center Assent (NIH CCA)",
    templateUrl: "/templates/nih-cc/nih-cc-consent-template-2024-04-15.docx", // Would be different assent template in future
    promptUrl: "/templates/nih-cc/adult-healthy-volunteer.txt", // Placeholder - would be different assent prompt
    schemaUrl: "/templates/nih-cc/adult-healthy-volunteer.json", // Placeholder
    procedureLibraryUrl: null, // Procedure library is embedded in prompts
    filename: "nih-assent-child.docx",
    disabled: true,
  },

  // Lay Person Abstract Templates (no procedure library)
  "lpa-adult-patient": {
    label: "Adult affected patient",
    prefix: "LPA",
    category: "Lay Person Abstract (LPA)",
    templateUrl: "/templates/lay-person-abstract/lay-person-abstract-template.docx",
    promptUrl: "/templates/lay-person-abstract/adult-affected-patient.txt",
    schemaUrl: "/templates/lay-person-abstract/adult-affected-patient.json",
    procedureLibraryUrl: null, // LPA doesn't use procedure library
    filename: "lay-person-abstract-patient.docx",
    disabled: false,
  },
  "lpa-adult-healthy": {
    label: "Adult healthy volunteer",
    prefix: "LPA",
    category: "Lay Person Abstract (LPA)",
    templateUrl: "/templates/lay-person-abstract/lay-person-abstract-template.docx",
    promptUrl: "/templates/lay-person-abstract/adult-healthy-volunteer.txt",
    schemaUrl: "/templates/lay-person-abstract/adult-healthy-volunteer.json",
    procedureLibraryUrl: null, // LPA doesn't use procedure library
    filename: "lay-person-abstract-healthy.docx",
    disabled: false,
  },
  "lpa-adult-family": {
    label: "Adult family member",
    prefix: "LPA",
    category: "Lay Person Abstract (LPA)",
    templateUrl: "/templates/lay-person-abstract/lay-person-abstract-template.docx",
    promptUrl: "/templates/lay-person-abstract/adult-family-member.txt",
    schemaUrl: "/templates/lay-person-abstract/adult-family-member.json",
    procedureLibraryUrl: null, // LPA doesn't use procedure library
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
