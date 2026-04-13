import { fileURLToPath } from "node:url";

function resolveAssetPath(relativePath) {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

export const DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-6";
export const MAX_SOURCE_REVIEW_CONCURRENCY = 10;

export const CATEGORY_DEFINITIONS = [
  { id: "template_completeness", title: "Template Completeness" },
  { id: "risk_and_safety", title: "Risk And Safety" },
  {
    id: "risk_benefit_and_scientific_justification",
    title: "Risk-Benefit And Scientific Justification",
  },
  {
    id: "equitable_selection_and_recruitment",
    title: "Equitable Selection And Recruitment",
  },
  { id: "consent_and_documentation", title: "Consent And Documentation" },
  { id: "privacy_data_and_specimens", title: "Privacy, Data, And Specimens" },
  { id: "vulnerable_populations", title: "Vulnerable Populations" },
  {
    id: "regulatory_pathway_and_nih_operations",
    title: "Regulatory Pathway And NIH Operations",
  },
];

export const PROMPT_PATHS = {
  system: resolveAssetPath("./prompts/system.txt"),
  sourceReview: resolveAssetPath("./prompts/source-review.txt"),
  contradictionReviewSystem: resolveAssetPath("./prompts/contradiction-review.system.txt"),
  contradictionReviewUser: resolveAssetPath("./prompts/contradiction-review.user.txt"),
  consentContradictionReviewSystem: resolveAssetPath(
    "./prompts/consent-contradiction-review.system.txt"
  ),
  consentContradictionReviewUser: resolveAssetPath(
    "./prompts/consent-contradiction-review.user.txt"
  ),
  crossDocComparisonSystem: resolveAssetPath("./prompts/cross-doc-comparison.system.txt"),
  crossDocComparisonUser: resolveAssetPath("./prompts/cross-doc-comparison.user.txt"),
  finalReport: resolveAssetPath("./prompts/final-report.txt"),
  sourceReviewSchema: resolveAssetPath("./schemas/source-review.schema.json"),
};

export const BASE_SOURCE_DEFINITIONS = [
  {
    id: "45-cfr-part-46",
    title: "45 CFR Part 46",
    path: resolveAssetPath("./assets/references/31-45-cfr-part-46.txt"),
    defaultCategory: "risk_and_safety",
    instruction:
      "Review this federal human-subjects source against the protocol. Identify only high-signal findings and map each finding into the allowed category ids.",
  },
  {
    id: "21-cfr-part-50",
    title: "21 CFR Part 50",
    path: resolveAssetPath("./assets/references/32-21-cfr-part-50.txt"),
    defaultCategory: "consent_and_documentation",
    instruction:
      "Review this FDA informed-consent source against the protocol. If the study is not FDA-regulated or the source otherwise does not apply, mark it not applicable with no findings.",
  },
  {
    id: "21-cfr-part-56",
    title: "21 CFR Part 56",
    path: resolveAssetPath("./assets/references/33-21-cfr-part-56.txt"),
    defaultCategory: "regulatory_pathway_and_nih_operations",
    instruction:
      "Review this FDA IRB source against the protocol. If the study is not FDA-regulated or the source otherwise does not apply, mark it not applicable with no findings.",
  },
  {
    id: "21-cfr-part-312",
    title: "21 CFR Part 312",
    path: resolveAssetPath("./assets/references/34-21-cfr-part-312.txt"),
    defaultCategory: "regulatory_pathway_and_nih_operations",
    instruction:
      "Review this FDA IND source against the protocol. Focus on applicability, IND status, and any clear regulatory gating issues.",
  },
  {
    id: "21-cfr-part-812",
    title: "21 CFR Part 812",
    path: resolveAssetPath("./assets/references/35-21-cfr-part-812.txt"),
    defaultCategory: "regulatory_pathway_and_nih_operations",
    instruction:
      "Review this FDA IDE/device source against the protocol. If the study is not device-related, mark it not applicable.",
  },
  {
    id: "42-cfr-part-11",
    title: "42 CFR Part 11",
    path: resolveAssetPath("./assets/references/36-42-cfr-part-11.txt"),
    defaultCategory: "regulatory_pathway_and_nih_operations",
    instruction:
      "Review this ClinicalTrials.gov source against the protocol. Apply only if the study characteristics make it relevant.",
  },
  {
    id: "nih-policy-3014-204",
    title: "NIH Policy 3014-204",
    path: resolveAssetPath("./assets/references/18-nih-policy-3014-204.txt"),
    defaultCategory: "risk_and_safety",
    instruction:
      "Review this NIH approval-criteria policy against the protocol and identify NIH-specific gaps or clarifications.",
  },
  {
    id: "nih-policy-3014-205",
    title: "NIH Policy 3014-205",
    path: resolveAssetPath("./assets/references/19-nih-policy-3014-205.txt"),
    defaultCategory: "template_completeness",
    instruction:
      "Review this NIH protocol-content policy as a completeness source. Focus on missing or weak required protocol content.",
  },
  {
    id: "nih-policy-3014-301",
    title: "NIH Policy 3014-301",
    path: resolveAssetPath("./assets/references/20-nih-policy-3014-301.txt"),
    defaultCategory: "consent_and_documentation",
    instruction:
      "Review this NIH informed-consent policy against the protocol. Focus on consent process, consent content, assent, optional procedures, and consent documentation.",
  },
  {
    id: "nih-policy-3014-302",
    title: "NIH Policy 3014-302",
    path: resolveAssetPath("./assets/references/21-nih-policy-3014-302.txt"),
    defaultCategory: "equitable_selection_and_recruitment",
    instruction:
      "Review this NIH recruitment and compensation policy against the protocol. Focus on barriers, compensation, and equitable participation.",
  },
  {
    id: "nih-policy-3014-400",
    title: "NIH Policy 3014-400",
    path: resolveAssetPath("./assets/references/22-nih-policy-3014-400.txt"),
    defaultCategory: "vulnerable_populations",
    instruction:
      "Review this vulnerable-population policy against the protocol and mark it not applicable if the protected population is not implicated.",
  },
  {
    id: "nih-policy-3014-401",
    title: "NIH Policy 3014-401",
    path: resolveAssetPath("./assets/references/23-nih-policy-3014-401.txt"),
    defaultCategory: "vulnerable_populations",
    instruction:
      "Review this prisoner policy against the protocol and mark it not applicable if prisoners are not implicated.",
  },
  {
    id: "nih-policy-3014-402",
    title: "NIH Policy 3014-402",
    path: resolveAssetPath("./assets/references/24-nih-policy-3014-402.txt"),
    defaultCategory: "vulnerable_populations",
    instruction:
      "Review this children policy against the protocol and mark it not applicable if children are not implicated.",
  },
  {
    id: "nih-policy-3014-403",
    title: "NIH Policy 3014-403",
    path: resolveAssetPath("./assets/references/25-nih-policy-3014-403.txt"),
    defaultCategory: "vulnerable_populations",
    instruction:
      "Review this policy for adults lacking decision-making capacity against the protocol and mark it not applicable if that population is not implicated.",
  },
  {
    id: "nih-policy-3014-404",
    title: "NIH Policy 3014-404",
    path: resolveAssetPath("./assets/references/26-nih-policy-3014-404.txt"),
    defaultCategory: "vulnerable_populations",
    instruction:
      "Review this NIH staff policy against the protocol and mark it not applicable if the source does not apply.",
  },
  {
    id: "nih-policy-3014-500",
    title: "NIH Policy 3014-500",
    path: resolveAssetPath("./assets/references/27-nih-policy-3014-500.txt"),
    defaultCategory: "regulatory_pathway_and_nih_operations",
    instruction:
      "Review this NIH drugs, biologics, and nutritional products policy against the protocol. Focus on regulatory-pathway and oversight issues.",
  },
  {
    id: "nih-policy-3014-501",
    title: "NIH Policy 3014-501",
    path: resolveAssetPath("./assets/references/28-nih-policy-3014-501.txt"),
    defaultCategory: "regulatory_pathway_and_nih_operations",
    instruction:
      "Review this NIH device policy against the protocol and mark it not applicable if the source does not apply.",
  },
  {
    id: "nih-policy-3014-503",
    title: "NIH Policy 3014-503",
    path: resolveAssetPath("./assets/references/3014-503-data-and-safety-monitoring.txt"),
    defaultCategory: "risk_and_safety",
    instruction:
      "Review this NIH data and safety monitoring policy against the protocol. Focus on monitoring adequacy, DSMB logic, and safety escalation.",
  },
  {
    id: "nih-policy-3014-801",
    title: "NIH Policy 3014-801",
    path: resolveAssetPath("./assets/references/3014-801-reporting-research-events.txt"),
    defaultCategory: "regulatory_pathway_and_nih_operations",
    instruction:
      "Review this NIH reporting research events policy against the protocol. Focus on reportable events, oversight, and operational obligations.",
  },
  {
    id: "nih-policy-3014-802",
    title: "NIH Policy 3014-802",
    path: resolveAssetPath("./assets/references/29-nih-policy-3014-802.txt"),
    defaultCategory: "regulatory_pathway_and_nih_operations",
    instruction:
      "Review this NIH non-compliance policy against the protocol only to the extent it creates clear preventive or structural obligations.",
  },
  {
    id: "nih-policy-3016",
    title: "NIH Policy 3016",
    path: resolveAssetPath("./assets/references/30-nih-policy-3016.txt"),
    defaultCategory: "privacy_data_and_specimens",
    instruction:
      "Review this NIH human data sharing policy against the protocol. Focus on data sharing, privacy, and governance implications.",
  },
  {
    id: "nih-policy-3007",
    title: "NIH Policy 3007",
    path: resolveAssetPath("./assets/references/12-nih-policy-3007.txt"),
    defaultCategory: "regulatory_pathway_and_nih_operations",
    instruction:
      "Review this NIH ClinicalTrials.gov policy against the protocol and mark it not applicable if the protocol does not trigger registration or results obligations.",
  },
  {
    id: "nih-policy-3008",
    title: "NIH Policy 3008",
    path: resolveAssetPath("./assets/references/13-nih-policy-3008.txt"),
    defaultCategory: "privacy_data_and_specimens",
    instruction:
      "Review this NIH biospecimen stewardship policy against the protocol and mark it not applicable if repository or biospecimen stewardship obligations are not relevant.",
  },
  {
    id: "nih-policy-3014-106",
    title: "NIH Policy 3014-106",
    path: resolveAssetPath("./assets/references/3014-106-ancillary-reviews.txt"),
    defaultCategory: "regulatory_pathway_and_nih_operations",
    instruction:
      "Review this ancillary-review policy against the protocol and identify only clearly applicable ancillary-review obligations.",
  },
  {
    id: "nih-policy-3014-300",
    title: "NIH Policy 3014-300",
    path: resolveAssetPath("./assets/references/3014-300-investigator-responsibilities.txt"),
    defaultCategory: "regulatory_pathway_and_nih_operations",
    instruction:
      "Review this investigator-responsibilities policy against the protocol only for clear protocol-facing obligations.",
  },
  {
    id: "nih-policy-3014-303",
    title: "NIH Policy 3014-303",
    path: resolveAssetPath(
      "./assets/references/3014-303-intramural-research-program-telehealth-requirements.txt"
    ),
    defaultCategory: "regulatory_pathway_and_nih_operations",
    instruction:
      "Review this telehealth policy against the protocol and mark it not applicable if telehealth or remote consent are not relevant.",
  },
  {
    id: "nih-policy-3014-502",
    title: "NIH Policy 3014-502",
    path: resolveAssetPath(
      "./assets/references/3014-502-expanded-access-including-emergency-use-of-investigational-drugs-biologics-and-medical-devices-test-articles.txt"
    ),
    defaultCategory: "regulatory_pathway_and_nih_operations",
    instruction:
      "Review this expanded-access and emergency-use policy against the protocol and mark it not applicable if those scenarios are not relevant.",
  },
  {
    id: "nih-policy-3014-700",
    title: "NIH Policy 3014-700",
    path: resolveAssetPath("./assets/references/3014-700-international-research.txt"),
    defaultCategory: "regulatory_pathway_and_nih_operations",
    instruction:
      "Review this international-research policy against the protocol and mark it not applicable if international conduct is not relevant.",
  },
];

export const TEMPLATE_DEFINITIONS = {
  behavioral_social_science: {
    id: "behavioral_social_science",
    title: "Behavioral / Social Science Research Protocol Template",
    path: resolveAssetPath(
      "./assets/templates-v2/01-behavioral-social-science-research-protocol-template.txt"
    ),
  },
  interventional: {
    id: "interventional",
    title: "Interventional Drug And Device Clinical Trials Protocol Template",
    path: resolveAssetPath(
      "./assets/templates-v2/02-interventional-drug-and-device-clinical-trials-protocol-template.txt"
    ),
  },
  natural_history_observational: {
    id: "natural_history_observational",
    title: "Natural History And Observational Trials Protocol Template",
    path: resolveAssetPath(
      "./assets/templates-v2/03-natural-history-and-observational-trials-protocol-template.txt"
    ),
  },
  prospective_data_collection: {
    id: "prospective_data_collection",
    title: "Prospective Data Collection Protocol Template",
    path: resolveAssetPath(
      "./assets/templates-v2/06-prospective-data-collection-protocol-template.txt"
    ),
  },
  repository: {
    id: "repository",
    title: "Repository Protocol Template",
    path: resolveAssetPath("./assets/templates-v2/08-repository-protocol-template.txt"),
  },
  retrospective_review: {
    id: "retrospective_review",
    title: "Retrospective Review Protocol Template",
    path: resolveAssetPath(
      "./assets/templates-v2/09-retrospective-data-or-biospecimen-review-protocol-template.txt"
    ),
  },
  secondary_research: {
    id: "secondary_research",
    title: "Secondary Research Protocol Template",
    path: resolveAssetPath("./assets/templates-v2/11-secondary-research-protocol-template.txt"),
  },
};
