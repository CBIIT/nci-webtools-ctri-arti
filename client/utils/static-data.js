const jsonCache = new Map();
const textCache = new Map();

function getCached(cache, key, loader) {
  if (!cache.has(key)) {
    cache.set(
      key,
      loader().catch((error) => {
        cache.delete(key);
        throw error;
      })
    );
  }
  return cache.get(key);
}

export function fetchCachedJson(url, init) {
  const key = JSON.stringify([url, init || null]);
  return getCached(jsonCache, key, async () => {
    const response = await fetch(url, init);
    if (!response.ok) {
      const error = new Error(`Failed to fetch JSON from ${url}`);
      error.response = response;
      throw error;
    }
    return response.json();
  });
}

export function fetchCachedText(url, init) {
  const key = JSON.stringify([url, init || null]);
  return getCached(textCache, key, async () => {
    const response = await fetch(url, init);
    if (!response.ok) {
      const error = new Error(`Failed to fetch text from ${url}`);
      error.response = response;
      throw error;
    }
    return response.text();
  });
}

export function clearCachedData() {
  jsonCache.clear();
  textCache.clear();
}
