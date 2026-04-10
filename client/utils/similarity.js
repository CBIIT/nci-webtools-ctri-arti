import { AutoModel, AutoTokenizer, Tensor } from "@huggingface/transformers";

/**
 * Creates an embedder function with cached model and tokenizer
 *
 * @example
 * const embed = await createEmbedder("minishlab/potion-base-8M");
 * const embeddings = await embed(["hello", "world"]);
 *
 * @param {string} [model_name="minishlab/potion-base-8M"] - Model name
 * @param {Object} [options] - Additional options
 * @param {string} [options.model_type="model2vec"] - Model type
 * @param {string} [options.model_revision="main"] - Model revision
 * @param {string} [options.tokenizer_revision="main"] - Tokenizer revision
 * @param {string} [options.dtype="fp32"] - Data type
 * @param {string} [options.device="wasm" | "webgpu"] - Device (defaults to "webgpu" if available, otherwise "wasm")
 * @returns {Promise<(texts: string[]) => Promise<number[][]>>} - Function that generates embeddings
 */
export async function createEmbedder(model_name = "minishlab/potion-base-8M", options = {}) {
  const {
    model_type = "model2vec",
    model_revision = "main",
    tokenizer_revision = "main",
    device = navigator?.gpu ? "webgpu" : undefined, // use webgpu if available
    dtype = "fp32",
  } = options;

  // Load model and tokenizer once
  const model = await AutoModel.from_pretrained(model_name, {
    config: { model_type },
    revision: model_revision,
    device,
    dtype,
  });

  const tokenizer = await AutoTokenizer.from_pretrained(model_name, {
    revision: tokenizer_revision,
  });

  /**
   * Generate embeddings for the provided texts
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} - Text embeddings
   */
  return async function embed(texts, _tokenizer_options = {}) {
    // Tokenize inputs
    const { input_ids } = await tokenizer(texts, {
      add_special_tokens: false,
      return_tensor: false,
    });

    // Calculate offsets
    const offsets = [0];
    for (let i = 0; i < input_ids.length - 1; i++) {
      offsets.push(offsets[i] + input_ids[i].length);
    }

    // Create tensors and get embeddings from flattened input ids and offsets
    const flattened_input_ids = input_ids.flat();
    const model_inputs = {
      input_ids: new Tensor("int64", flattened_input_ids, [flattened_input_ids.length]),
      offsets: new Tensor("int64", offsets, [offsets.length]),
    };

    const { embeddings } = await model(model_inputs);
    return embeddings.tolist();
  };
}
