export const NOVA_EMBEDDING_MODEL = "amazon.nova-2-multimodal-embeddings-v1:0";
export const NOVA_EMBEDDING_DIMENSIONS = 3072;
export const NOVA_INDEX_PURPOSE = "GENERIC_INDEX";
export const NOVA_RETRIEVAL_PURPOSE = "GENERIC_RETRIEVAL";
export const RESOURCE_CHUNK_SIZE = 4000;
export const RESOURCE_CHUNK_OVERLAP = 400;

export function isValidEmbedding(embedding, dimensions = NOVA_EMBEDDING_DIMENSIONS) {
  return (
    Array.isArray(embedding) &&
    embedding.length === dimensions &&
    embedding.every((value) => Number.isFinite(value))
  );
}

export function assertValidEmbedding(
  embedding,
  { dimensions = NOVA_EMBEDDING_DIMENSIONS, message } = {}
) {
  if (!isValidEmbedding(embedding, dimensions)) {
    throw new Error(message || `Expected embedding with ${dimensions} numeric dimensions`);
  }
  return embedding;
}

export function getEmbeddingsFromResult(
  result,
  { expectedCount, dimensions = NOVA_EMBEDDING_DIMENSIONS } = {}
) {
  if (result?.error) {
    throw new Error(result.error);
  }

  const embeddings = result?.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length === 0) {
    throw new Error("Embedding request returned no embeddings");
  }
  if (expectedCount !== undefined && embeddings.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} embeddings, received ${embeddings.length}`);
  }

  return embeddings.map((embedding, index) =>
    assertValidEmbedding(embedding, {
      dimensions,
      message: `Embedding ${index} must contain ${dimensions} numeric dimensions`,
    })
  );
}
