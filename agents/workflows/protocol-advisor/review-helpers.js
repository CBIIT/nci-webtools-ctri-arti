import fs from "node:fs";

export const ALLOWED_VERDICTS = [
  "compliant",
  "non_compliant",
  "insufficient_evidence",
  "conditional_gap",
  "not_applicable",
];

export function sanitizeText(text) {
  return String(text || "")
    .replaceAll("\0", "")
    .replace(/^\uFEFF/, "");
}

export function readUtf8(filePath) {
  return sanitizeText(fs.readFileSync(filePath, "utf8"));
}

export function renderTemplate(templateText, variables = {}) {
  return templateText.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key) => {
    const value = variables[key];
    return value == null ? "" : String(value);
  });
}

export function responseText(result) {
  return (result?.output?.message?.content || [])
    .map((block) => block?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function extractJsonObject(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Model returned empty text.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      return JSON.parse(fenced[1].trim());
    }
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error(`Could not parse JSON from model response: ${trimmed.slice(0, 500)}`);
  }
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

export function verdictRank(value) {
  switch (value) {
    case "non_compliant":
      return 0;
    case "insufficient_evidence":
      return 1;
    case "conditional_gap":
      return 2;
    case "compliant":
      return 3;
    case "not_applicable":
      return 4;
    default:
      return 9;
  }
}

export function overallDisposition(sourceVerdictCounts) {
  if ((sourceVerdictCounts.non_compliant || 0) > 0) {
    return {
      code: "remediation_required",
      recommendation: "Remediation required before the protocol can be represented as compliant.",
    };
  }
  if ((sourceVerdictCounts.insufficient_evidence || 0) > 0) {
    return {
      code: "clarification_required",
      recommendation: "Clarification required before a clean compliance conclusion is possible.",
    };
  }
  if ((sourceVerdictCounts.conditional_gap || 0) > 0) {
    return {
      code: "conditional_gap_only",
      recommendation: "No live non-compliance identified, but gap remediation is still required.",
    };
  }
  return {
    code: "no_material_gaps_identified",
    recommendation: "No material gaps identified in the reviewed source set.",
  };
}

export function deriveVerdictFromFindings(review) {
  if (!review.applies) return "not_applicable";
  const statuses = (review.findings || []).map((item) => item.status);
  if (statuses.includes("non_compliant")) return "non_compliant";
  if (statuses.includes("insufficient_evidence")) return "insufficient_evidence";
  if (statuses.includes("conditional_gap")) return "conditional_gap";
  return "compliant";
}

export function validateSourceReview(payload, allowedCategoryIds, source) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Source review must be a JSON object.");
  }
  if (payload.task_type !== "source_review") {
    throw new Error(`Expected task_type "source_review", got "${payload.task_type}".`);
  }
  if (typeof payload.summary !== "string") {
    throw new Error("Source review must include string summary.");
  }

  const review = payload.source_review;
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    throw new Error("Missing source_review object.");
  }
  if (typeof review.applies !== "boolean") {
    throw new Error("source_review.applies must be boolean.");
  }
  if (!["historical_only", "current_gap", "mixed"].includes(review.review_basis)) {
    throw new Error(`Unsupported review_basis "${review.review_basis}".`);
  }
  if (!Array.isArray(review.findings)) {
    throw new Error("source_review.findings must be an array.");
  }
  for (const finding of review.findings) {
    if (!allowedCategoryIds.includes(finding.category_id)) {
      finding.category_id = source.defaultCategory || allowedCategoryIds[0];
    }
    if (!ALLOWED_VERDICTS.includes(finding.status)) {
      throw new Error(`Unsupported finding status "${finding.status}".`);
    }
  }

  const normalizedReview = {
    ...review,
    source_id: source.id,
    source_title: source.title,
  };
  if (!normalizedReview.applies && normalizedReview.findings.length > 0) {
    normalizedReview.applies = true;
  }
  normalizedReview.verdict = deriveVerdictFromFindings(normalizedReview);
  if (!normalizedReview.applies) {
    normalizedReview.verdict = "not_applicable";
  }

  return {
    task_type: "source_review",
    summary: payload.summary,
    source_review: normalizedReview,
  };
}

export async function invokeGatewayJson({
  gateway,
  userId,
  requestId,
  model,
  type,
  system,
  userText,
}) {
  const attempts = [
    userText,
    `${userText}\n\nIMPORTANT RETRY INSTRUCTION\nYour previous response was invalid JSON. Return only one valid JSON object matching the required schema exactly. Do not include markdown, comments, or trailing text.`,
  ];

  let lastError = null;
  for (const attemptText of attempts) {
    const response = await gateway.invoke({
      userId,
      requestId,
      model,
      system,
      messages: [{ role: "user", content: [{ text: attemptText }] }],
      type,
    });
    const text = responseText(response);
    try {
      return { response, json: extractJsonObject(text) };
    } catch (error) {
      lastError = new Error(`${error.message}\nModel response excerpt:\n${text.slice(0, 1200)}`);
    }
  }

  throw lastError || new Error("Model returned invalid JSON.");
}

export async function invokeGatewayText({
  gateway,
  userId,
  requestId,
  model,
  type,
  system,
  userText,
}) {
  const response = await gateway.invoke({
    userId,
    requestId,
    model,
    system,
    messages: [{ role: "user", content: [{ text: userText }] }],
    type,
  });

  return {
    response,
    text: responseText(response),
  };
}
