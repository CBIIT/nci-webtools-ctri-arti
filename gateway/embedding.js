import { getModelProvider } from "./chat.js";

/**
 * Build the provider-specific request body for an embedding model.
 *
 * Supported families:
 *   - Amazon Titan Embed (amazon.titan-embed-*)
 *   - Cohere Embed (cohere.embed-*)
 */
function buildEmbeddingRequest(internalName, texts) {
  if (internalName.startsWith("amazon.titan-embed")) {
    // Titan accepts a single string per invocation.
    // We batch by calling once per text in runEmbedding.
    return (text) => ({
      inputText: text,
      dimensions: 1024,
      normalize: true,
    });
  }

  if (internalName.startsWith("cohere.embed")) {
    // Cohere accepts an array of texts in one call.
    return () => ({
      texts,
      input_type: "search_document",
      truncate: "END",
    });
  }

  throw new Error(`Unsupported embedding model: ${internalName}`);
}

/**
 * Parse the provider-specific response into a normalized embedding array.
 *
 * @returns {{ embeddings: number[][], inputTokens: number }}
 */
function parseEmbeddingResponse(internalName, responseBody) {
  if (internalName.startsWith("amazon.titan-embed")) {
    return {
      embeddings: [responseBody.embedding],
      inputTokens: responseBody.inputTextTokenCount || 0,
    };
  }

  if (internalName.startsWith("cohere.embed")) {
    return {
      embeddings: responseBody.embeddings,
      inputTokens: 0, // Cohere does not return token counts
    };
  }

  throw new Error(`Unsupported embedding model: ${internalName}`);
}

/**
 * Run an embedding request against a Bedrock embedding model.
 *
 * @param {Object} params
 * @param {Object} params.model - Full model record from DB
 * @param {string[]} params.texts - Array of text strings to embed
 * @returns {Promise<Object>} Normalized embedding response
 */
export async function runEmbedding({ model, texts }) {
  if (!model || !texts || texts.length === 0) {
    return null;
  }

  const { model: modelWithProvider, provider } = await getModelProvider(model);
  const { internalName } = modelWithProvider;
  const buildRequest = buildEmbeddingRequest(internalName, texts);

  let allEmbeddings = [];
  let totalTokens = 0;

  if (internalName.startsWith("amazon.titan-embed")) {
    // Titan: one invocation per text
    for (const text of texts) {
      const body = buildRequest(text);
      const response = await provider.invokeModel(internalName, body);
      const parsed = parseEmbeddingResponse(internalName, response);
      allEmbeddings.push(...parsed.embeddings);
      totalTokens += parsed.inputTokens;
    }
  } else {
    // Cohere: single invocation for all texts
    const body = buildRequest();
    const response = await provider.invokeModel(internalName, body);
    const parsed = parseEmbeddingResponse(internalName, response);
    allEmbeddings = parsed.embeddings;
    totalTokens = parsed.inputTokens;
  }

  return {
    object: "list",
    modelID: model.id,
    data: allEmbeddings.map((embedding, index) => ({
      object: "embedding",
      index,
      embedding,
    })),
    usage: {
      promptTokens: totalTokens,
      totalTokens,
    },
  };
}
