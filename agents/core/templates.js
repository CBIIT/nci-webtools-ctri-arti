import { readFileSync } from "node:fs";

import { loadProtocolAdvisorAssets } from "../workflows/protocol-advisor/load-assets.js";

let cachedList = null;

function toSummary(template) {
  return {
    templateId: template.templateId,
    displayName: template.displayName,
    purpose: template.purpose,
    url: template.url,
  };
}

export async function getTemplates() {
  if (cachedList) return cachedList;

  const assets = await loadProtocolAdvisorAssets({
    input: { templateId: "interventional" },
  });

  cachedList = assets.templates.map(toSummary);
  return cachedList;
}

export async function getTemplate(templateId) {
  const assets = await loadProtocolAdvisorAssets({
    input: { templateId },
  });

  const template = assets.selectedTemplate;
  const content = readFileSync(template.sourcePath, "utf-8");

  return {
    ...toSummary(template),
    content,
  };
}
