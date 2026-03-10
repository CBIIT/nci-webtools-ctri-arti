import { getModelProvider } from "./chat.js";

/**
 * Run an embedding request against a Bedrock embedding model.
 *
 * Supported families:
 *   - Amazon Titan Embed (amazon.titan-embed-*) — single text per invocation
 *   - Cohere Embed (cohere.embed-*) — batch texts in one call
 *
 * @param {Object} params
 * @param {Object} params.model - Full model record from DB (with Provider relation)
 * @param {string[]} params.texts - Array of text strings to embed
 * @returns {Promise<Object>} Normalized embedding response
 */
export async function runEmbedding({ model, texts }) {
  if (!model || !texts || texts.length === 0) {
    return null;
  }

  const provider = getModelProvider(model);
  const { internalName } = model;

  let allEmbeddings = [];
  let totalTokens = 0;

  if (internalName.startsWith("amazon.titan-embed")) {
    for (const text of texts) {
      const response = await provider.invokeModel(internalName, {
        inputText: text,
        dimensions: 1024,
        normalize: true,
      });
      allEmbeddings.push(response.embedding);
      totalTokens += response.inputTextTokenCount || 0;
    }
  } else if (internalName.startsWith("cohere.embed")) {
    const response = await provider.invokeModel(internalName, {
      texts,
      input_type: "search_document",
      truncate: "END",
    });
    allEmbeddings = response.embeddings;
  } else {
    throw new Error(`Unsupported embedding model: ${internalName}`);
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
