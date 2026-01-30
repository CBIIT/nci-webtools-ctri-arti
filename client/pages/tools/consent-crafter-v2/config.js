// Key groups for chunked extraction (larger batches for better performance)
// Note: The schema uses flattened field names (e.g., Phase_Trial_type instead of Phase_Trial.type)
// to work with docx-templates variable syntax.
export const KEY_GROUPS = [
  // Group 1: Basic Study Info, Contacts & Overview
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
    "Why_Asked",
    "Study_Purpose",
    "Disease_Condition",
    "Phase_Trial_type",
    "Phase_Trial_explanation",
    "FDA_Approval_Status",
    "Brief_Happenings",
    "Brief_Risks",
    "Brief_Alternatives",
    "Responsibilities",
    "Brief_Benefits",
  ],
  // Group 2: Timeline, Procedures & Study Design
  [
    "Voluntariness",
    "Parent_Permission",
    "Impaired_Adults",
    "How_Long",
    "How_Many",
    "Introduction",
    "Study_Design_Explanation_overview",
    "Study_Design_Explanation_randomization",
    "Study_Design_Explanation_blinding",
    "Study_Design_Explanation_placebo",
    "Randomization_Process",
    "Blinding_Process",
    "Before_You_Begin",
    "During_The_Study",
    "Follow_Up",
  ],
  // Group 3: Drug Risks & Procedure Risks
  [
    "Study_Drug_Risks_title",
    "Study_Drug_Risks_general_description",
    "Study_Drug_Risks_side_effects_info",
    "Study_Drug_Risks_specific_risks",
    "Risks_Discomforts",
    "Radiation_Risks_title",
    "Radiation_Risks_diagnostic_low_dose",
    "Radiation_Risks_diagnostic_moderate_dose",
    "Radiation_Risks_diagnostic_high_dose",
    "Radiation_Risks_therapeutic_title",
    "Radiation_Risks_therapeutic_description",
    "Radiation_Risks_combined_exposure",
    "Radiation_Risks_rdrc_reviewed",
  ],
  // Group 4: Pregnancy Risks
  [
    "Pregnancy_Risks_title",
    "Pregnancy_Risks_women_title",
    "Pregnancy_Risks_women_rationale",
    "Pregnancy_Risks_women_testing_required",
    "Pregnancy_Risks_women_testing_over_forty",
    "Pregnancy_Risks_women_contraception_required",
    "Pregnancy_Risks_women_if_pregnant",
    "Pregnancy_Risks_women_fertility_risk",
    "Pregnancy_Risks_men_title",
    "Pregnancy_Risks_men_rationale",
    "Pregnancy_Risks_men_contraception_required",
    "Pregnancy_Risks_men_seminal_transmission",
    "Pregnancy_Risks_men_if_partner_pregnant",
    "Pregnancy_Risks_men_fertility_risk",
  ],
  // Group 5: Benefits, Alternatives & Results
  [
    "Potential_Benefits_You",
    "Potential_Benefits_Others",
    "Other_Options",
    "Return_Results",
    "Early_Withdrawal",
  ],
  // Group 6: Data Saved Section
  [
    "Data_Saved_applicable",
    "Data_Saved_title",
    "Data_Saved_intro_question",
    "Data_Saved_description",
    "Data_Saved_permission_statement",
    "Data_Saved_checkbox_line",
    "Data_Saved_initial_line",
  ],
  // Group 7: Data Sharing Sections
  [
    "Data_Shared_Deidentified_applicable",
    "Data_Shared_Deidentified_intro_question",
    "Data_Shared_Deidentified_sharing_description",
    "Data_Shared_Deidentified_repository_description",
    "Data_Shared_Deidentified_data_save_type",
    "Data_Shared_Deidentified_deidentification_statement",
    "Data_Shared_Deidentified_permission_statement",
    "Data_Shared_Deidentified_checkbox_line",
    "Data_Shared_Deidentified_initial_line",
    "Data_Shared_Identified_applicable",
    "Data_Shared_Identified_description",
    "Data_Shared_Identified_permission_statement",
    "Data_Shared_Identified_checkbox_line",
    "Data_Shared_Identified_initial_line",
  ],
  // Group 8: Specimens, Financial & Legal
  [
    "Genomic_Sensitivity",
    "Anonymized_Specimen_Sharing",
    "Specimen_Storage",
    "Payment_Information",
    "Reimbursement_Information",
    "Costs",
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
