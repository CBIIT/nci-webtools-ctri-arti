/**
 * Token estimation and cache point placement for provider caching.
 *
 * Cache points are inserted at optimal positions in message arrays
 * using sqrt(2) scaling boundaries to maximize cache hit rates.
 */

/**
 * Estimates the number of tokens in a content item.
 * @param {Object} content - Content item from a message
 * @returns {number} Estimated token count
 */
export function estimateContentTokens(content) {
  let tokens = 0;
  if (content.text) tokens += Math.ceil(content.text.length / 8);
  if (content.document?.source?.text) tokens += Math.ceil(content.document.source.text.length / 8);
  if (content.document?.source?.bytes)
    tokens += Math.ceil(content.document.source.bytes.length / 3);
  if (content.image?.source?.bytes) tokens += Math.ceil(content.image.source.bytes.length / 3);
  if (content.toolUse) tokens += Math.ceil(JSON.stringify(content.toolUse).length / 8);
  if (content.toolResult) tokens += Math.ceil(JSON.stringify(content.toolResult).length / 8);
  return tokens;
}

/**
 * Calculates optimal cache boundaries using sqrt(2) scaling factor.
 * @param {number} maxTokens - Maximum token limit to consider
 * @returns {Array<number>} Array of token boundaries for cache points
 */
export function calculateCacheBoundaries(maxTokens = 2000000) {
  const boundaries = [];
  const scalingFactor = Math.sqrt(2); // ~1.414
  let boundary = 1024;

  while (boundary <= maxTokens) {
    boundaries.push(Math.round(boundary));
    boundary *= scalingFactor;
  }

  return boundaries;
}

/**
 * Adds cache points to messages array at optimal positions.
 * Places up to 2 cache points at token boundary crossings.
 *
 * @param {Array} messages - Array of message objects
 * @param {boolean} hasCache - Whether the model supports caching
 * @returns {Array} Messages array with cache points inserted
 */
export function addCachePointsToMessages(messages, hasCache) {
  if (!hasCache || !messages?.length) return messages;

  const cachePoint = { cachePoint: { type: "default" } };
  const boundaries = calculateCacheBoundaries();
  const result = [];
  let totalTokens = 0;
  const cachePositions = [];

  // First pass: find where to place cache points
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const messageTokens = message.content.reduce((sum, c) => sum + estimateContentTokens(c), 0);
    const previousTotal = totalTokens;
    totalTokens += messageTokens;

    // Check if we crossed any boundary
    for (const boundary of boundaries) {
      if (previousTotal < boundary && totalTokens >= boundary) {
        cachePositions.push({
          index: i,
          boundary,
          tokensBeforeMessage: previousTotal,
        });
        break;
      }
    }
  }

  // Keep only the last 2 cache positions
  const selectedPositions = cachePositions.slice(-2);

  // Second pass: build result with cache points
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const shouldAddCache = selectedPositions.some((pos) => pos.index === i);

    if (shouldAddCache) {
      result.push({
        ...message,
        content: [...message.content, cachePoint],
      });
    } else {
      result.push(message);
    }
  }

  return result;
}
