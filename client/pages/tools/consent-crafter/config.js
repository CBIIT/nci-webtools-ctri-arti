// NIH Clinical Center Consent Form Default Output Structure
export const defaultOutput = {
  references: [],
  PI: "",
  Title: "",
  Study_Site: "",
  Cohort: "",
  Contact_Name: "",
  Contact_Email: "",
  Contact_Phone: "",
  Why_Asked: "",
  Intervention: "",
  Intervention_Uses: "",
  Intervention_Not_Approved: "",
  Study_Purpose: "",
  Brief_Risks: "",
  Brief_Alternatives: "",
  Phase1_Why: "",
  Therapeutic_Trial: "",
  Brief_Happenings: "",
  Time_Commitment: "",
  Responsibilities: "",
  Benefits_Brief: "",
  Voluntariness: "",
  Participation_Requirements: "",
  Study_Procedures: "",
  Potential_Benefits_You: "",
  Potential_Benefits_Others: "",
  Payment: "",
  Partial_Payment: "",
  Payment_Large: "",
  Reimbursement: "",
  Reimbursement_Identifiable: "",
  Costs: "",
  Parent_Permission: "",
  Impaired_Adults: "",
  Before_You_Begin: [],
  During_The_Study: [],
  Follow_Up: [],
  How_Long: "",
  How_Many: "",
  Risks_Discomforts: [],
  Risks_Procedures: [],
  Risks_Pregnancy: "",
  Risks_Radiation: "",
  Rad_Risk_LT3: "",
  Rad_Risk_GE3_LT5: "",
  Rad_Risk_GT5: "",
  Thera_Rad: "",
  Alternatives: "",
  Other_Options: "",
  Return_Results: "",
  Early_Withdrawal: "",
  Disease_Condition: "",
  Genomic_Sensitivity: "",
  Anonymized_Specimen_Sharing: "",
  Data_Save_Type: "",
  Specimen_Storage: "",
  No_Payment: "",
  Yes_Payment: "",
  Abbreviated_Risks: "", 
  COI_None: "",
  Technology_License: "",
  CRADA: "",
  CTA_No_NonNIH: "",
  CTA_Yes_NonNIH: "",
  Confidentiality: "",
  Study_Sponsor: "",
  Confidentiality_Study_Sponsor: "",
  Manufacturer: "",
  Confidentiality_Manufacturer: "",
  Confidentiality_Drug_Device: "",
  Drug_Device: "",
  Investigational_Use: "",
  Approved_Use: "",
  Other_Contacts: "",
  Other_Contact_Name: "",
  Other_Contact_Email: "",
  Other_Contact_Phone: "",
};

// Lay Person Abstract Default Output Structure
export const lpa_default_output = {
  study_title: "",
  nct_number: "",
  institute: "",
  simple_summary: "",
  purpose: "",
  who_can_participate: [],
  who_cannot_participate: [],
  investigator_names: [],
  procedures: [],
  timeline: "",
  visits_required: "",
  potential_benefits: "",
  potential_benefits_others: "",
  potential_risks: [],
  expanded_risks: "",
  alternatives: "",
  costs_and_compensation: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  voluntariness: "",
  withdrawal: "",
  other_questions: [],
  references: [],
};

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
        prefix: "NIH CC",
        category: "NIH Clinical Center Consent",
        templateUrl: "/templates/nih-cc/nih-cc-consent-template-2024-04-15.docx",
        promptUrl: "/templates/nih-cc/adult-affected-patient.txt",
        defaultOutput: defaultOutput,
        filename: "nih-cc-consent-adult-affected.docx",
        disabled: false,
    },
    // NIH Clinical Center Consent Forms
    "nih-cc-adult-healthy": {
        label: "Adult healthy volunteer",
        prefix: "NIH CC",
        category: "NIH Clinical Center Consent",
        templateUrl: "/templates/nih-cc/nih-cc-consent-template-2024-04-15.docx",
        promptUrl: "/templates/nih-cc/adult-healthy-volunteer.txt",
        defaultOutput: defaultOutput,
        filename: "nih-cc-consent-adult-healthy.docx",
        disabled: false,
    },
    "nih-cc-adult-family": {
        label: "Adult family member",
        prefix: "NIH CC",
        category: "NIH Clinical Center Consent",
        templateUrl: "/templates/nih-cc/nih-cc-consent-template-2024-04-15.docx",
        promptUrl: "/templates/nih-cc/adult-family-member.txt",
        defaultOutput: defaultOutput,
        filename: "nih-cc-consent-adult-family.docx",
        disabled: false,
    },
    "nih-cc-child-assent": {
        label: "Child or cognitive impairment patient",
        prefix: "NIH CC",
        category: "NIH Clinical Center Assent",
        templateUrl: "/templates/nih-cc/nih-cc-consent-template-2024-04-15.docx", // Would be different assent template in future
        promptUrl: "/templates/nih-cc/adult-healthy-volunteer.txt", // Placeholder - would be different assent prompt
        defaultOutput: defaultOutput,
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
        defaultOutput: lpa_default_output,
        filename: "lay-person-abstract-patient.docx",
        disabled: false,
    },
    "lpa-adult-healthy": {
        label: "Adult healthy volunteer",
        prefix: "LPA",
        category: "Lay Person Abstract (LPA)",
        templateUrl: "/templates/lay-person-abstract/lay-person-abstract-template.docx",
        promptUrl: "/templates/lay-person-abstract/adult-healthy-volunteer.txt",
        defaultOutput: lpa_default_output,
        filename: "lay-person-abstract-healthy.docx",
        disabled: false,
    },
    "lpa-adult-family": {
        label: "Adult family member",
        prefix: "LPA",
        category: "Lay Person Abstract (LPA)",
        templateUrl: "/templates/lay-person-abstract/lay-person-abstract-template.docx",
        promptUrl: "/templates/lay-person-abstract/adult-family-member.txt",
        defaultOutput: lpa_default_output,
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