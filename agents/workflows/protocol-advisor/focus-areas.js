export const PROTOCOL_ADVISOR_FOCUS_AREAS = [
  {
    id: "risk_minimization",
    title: "Risk Minimization",
    citation: "45 CFR 46.111(a)(1)",
  },
  {
    id: "risk_benefit_assessment",
    title: "Risk-Benefit Assessment",
    citation: "45 CFR 46.111(a)(2)",
  },
  {
    id: "equitable_selection",
    title: "Equitable Selection",
    citation: "45 CFR 46.111(a)(3)",
  },
  {
    id: "informed_consent",
    title: "Informed Consent",
    citation: "45 CFR 46.111(a)(4)",
  },
  {
    id: "privacy_confidentiality",
    title: "Privacy and Confidentiality",
    citation: "45 CFR 46.111(a)(7)",
  },
  {
    id: "vulnerable_population_safeguards",
    title: "Vulnerable Population Safeguards",
    citation: "45 CFR 46.111(b)",
  },
];

const focusAreaById = new Map(PROTOCOL_ADVISOR_FOCUS_AREAS.map((area) => [area.id, area]));

export function normalizeProtocolAdvisorFocusAreaIds(value) {
  const ids = Array.isArray(value) ? value : [];
  return ids.filter((id) => focusAreaById.has(id));
}

export function getProtocolAdvisorFocusArea(id) {
  return focusAreaById.get(id) || null;
}
