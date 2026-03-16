const DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

export function chunkText(
  text,
  { chunkSize = 24000, chunkOverlap = 800, separators = DEFAULT_SEPARATORS } = {}
) {
  if (text.length <= chunkSize) return [text];

  const chunks = [];
  splitRecursive(text, separators, chunkSize, chunkOverlap, chunks);
  return chunks;
}

function splitRecursive(text, separators, chunkSize, chunkOverlap, chunks) {
  if (text.length <= chunkSize) {
    if (text.trim()) chunks.push(text);
    return;
  }

  const sep = separators.find((s) => s === "" || text.includes(s)) ?? "";
  const parts = sep ? text.split(sep) : [...text];

  let current = "";
  for (const part of parts) {
    const candidate = current ? current + sep + part : part;
    if (candidate.length > chunkSize && current) {
      chunks.push(current);
      // overlap: keep the tail of the current chunk
      const overlapStart = Math.max(0, current.length - chunkOverlap);
      current = current.slice(overlapStart) + sep + part;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current);
}
