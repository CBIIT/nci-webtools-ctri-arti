export function normalizeEmbeddingUsageItems(usage = {}) {
  const mapping = [
    ["inputTextTokenCount", "input_tokens"],
    ["imageCount", "images"],
    ["videoSeconds", "video_seconds"],
    ["audioSeconds", "audio_seconds"],
  ];

  return mapping
    .map(([key, unit]) => {
      const quantity = usage?.[key];
      return quantity ? { quantity, unit } : null;
    })
    .filter(Boolean);
}

export function isLimitedBudgetUser(user) {
  return user?.budget !== null && user?.budget !== undefined;
}

export function getRemainingBudget(user) {
  if (!isLimitedBudgetUser(user)) return null;
  return user?.remaining ?? user?.budget ?? 0;
}

export function isRateLimitedUser(user) {
  const remaining = getRemainingBudget(user);
  return remaining !== null && remaining <= 0;
}

export function buildRateLimitMessage(resetDescription) {
  return (
    "You have reached your allocated usage limit. Your access to the chat tool is " +
    `temporarily disabled and will reset ${resetDescription}. If you need assistance ` +
    "or believe this is an error, please contact the Research Optimizer helpdesk at " +
    "CTRIBResearchOptimizer@mail.nih.gov."
  );
}
