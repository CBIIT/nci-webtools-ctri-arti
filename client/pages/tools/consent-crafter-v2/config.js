// Key groups for chunked extraction (77 keys grouped by topic for better extraction quality)
export const KEY_GROUPS = [
  // Group 1: Basic Study Info (10 keys)
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
  ],
  // Group 2: Study Overview (10 keys)
  [
    "Other_Contact_Phone",
    "Why_Asked",
    "Study_Purpose",
    "Time_Commitment",
    "Brief_Happenings",
    "Randomization_Process",
    "Blinding_Process",
    "How_Long",
    "How_Many",
    "Disease_Condition",
  ],
  // Group 3: Risks Overview (10 keys)
  [
    "Abbreviated_Risks",
    "Brief_Alternatives",
    "Responsibilities",
    "Brief_Benefits",
    "Voluntariness",
    "Risks_Study_Drug_Title",
    "Risks_Study_Drug_General",
    "Points_Side_Effects",
    "Other_Options",
    "FDA_Approval_Status",
  ],
  // Group 4: Study Timeline (10 keys)
  [
    "Before_You_Begin",
    "During_The_Study",
    "Follow_Up",
    "Risks_Discomforts",
    "Inclusion_Criteria",
    "Exclusion_Criteria",
    "Early_Withdrawal",
    "Return_Results",
    "Parent_Permission",
    "Impaired_Adults",
  ],
  // Group 5: Radiation Risks (10 keys)
  [
    "Risks_Radiation_Title",
    "Rad_Risk_LT3",
    "Rad_Risk_GE3_LT5",
    "Rad_Risk_GT5",
    "Thera_Rad_Title",
    "Thera_Rad",
    "Overall_Rad_Risk",
    "RDRC_Reviewed_Rad",
    "Potential_Benefits_You",
    "Potential_Benefits_Others",
  ],
  // Group 6: Pregnancy - Women (10 keys)
  [
    "Risks_Pregnancy_Title",
    "Risks_Pregnancy_Rationale_Women",
    "Pregnancy_Women_Title",
    "Pregnancy_Testing_Requirements",
    "Pregnancy_Testing_Women_Over_Forty",
    "Required_Contraception_Women",
    "Pregnancy_Event_Women",
    "Fertility_Risk_Women",
    "Risks_Pregnancy_Rationale_Men",
    "Pregnancy_Men_Title",
  ],
  // Group 7: Pregnancy - Men & Data (10 keys)
  [
    "Required_Contraception_Men",
    "Seminal_Transmission_Text",
    "Pregnancy_Event_Men",
    "Fertility_Risk_Men",
    "Data_Save_Type",
    "Genomic_Sensitivity",
    "Anonymized_Specimen_Sharing",
    "Specimen_Storage",
    "Payment_Information",
    "Reimbursement_Information",
  ],
  // Group 8: Financial & Legal (7 keys)
  [
    "Costs",
    "Conflict_Of_Interest_Information",
    "Clinical_Trial_Agreement_Information",
    "Confidentiality",
    "Confidentiality_Study_Sponsor",
    "Confidentiality_Manufacturer",
    "Confidentiality_Drug_Device",
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
  // NIH Clinical Center Consent Forms (use procedure library)
  "nih-cc-adult-patient": {
    label: "Adult affected patient",
    prefix: "NIH CCC",
    category: "NIH Clinical Center Consent (NIH CCC)",
    templateUrl: "/templates/nih-cc/nih-cc-consent-template-2024-04-15.docx",
    promptUrl: "/templates/nih-cc/adult-affected-patient.txt",
    schemaUrl: "/templates/nih-cc/adult-affected-patient.json",
    procedureLibraryUrl: "/templates/nih-cc/procedure-library.json",
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
    procedureLibraryUrl: "/templates/nih-cc/procedure-library.json",
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
    procedureLibraryUrl: "/templates/nih-cc/procedure-library.json",
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
    procedureLibraryUrl: "/templates/nih-cc/procedure-library.json",
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
