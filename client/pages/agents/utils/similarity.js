import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { matmul, AutoModel, AutoModelForCausalLM, AutoTokenizer, Tensor } from "@huggingface/transformers";


export async function inference(modelName = "onnx-community/Qwen3-0.6B-ONNX", messages, tools = [], outputTokens = 512) {
  const model = await AutoModelForCausalLM.from_pretrained(modelName, {  device: "webgpu" });
  const tokenizer = await AutoTokenizer.from_pretrained(modelName);
  const text = tokenizer.apply_chat_template(messages, {
    add_generation_prompt: true,
    tokenize: false,
    tools,
  });
  const inputs = await tokenizer(text);
  const outputs = await model.generate(...inputs, {max_new_tokens: outputTokens})

  const promptLength = inputs.input_ids.dims.at(-1);
  const generatedTokens = outputs.slice(null, [promptLength, null]);
  return tokenizer.decode(generatedTokens, { skip_special_tokens: true });
}

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
  return async function embed(texts, tokenizer_options = {}) {
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

/**
 * Gets embeddings for a list of texts and computes similarity scores with a query
 * @param {string[]} texts - List of texts
 * @param {string} query - Query text
 * @param {string} model - Model name
 * @returns {Promise<{embeddings: number[][], similarities?: number[][]}>} - Embeddings and similarity scores
 */
export async function getEmbeddings(texts = [], query = "", model = "minishlab/potion-base-8M") {
  if (query) {
    const embeddings = await embed([query].concat(texts), model, { raw: true });
    const similarities = (await matmul(embeddings.slice([0, 1]), embeddings.slice([1, null]).transpose(1, 0))).mul(100);
    return { embeddings: embeddings.tolist(), similarities: similarities.tolist() };
  }
  return { embeddings: await embed(texts, model) };
}

/**
 * Creates text embeddings using Model2Vec
 * @example await embed(['hello', 'world'])
 *
 * @param {string[]} texts - Array of texts to embed
 * @param {string} [model_name='minishlab/potion-base-8M'] - Model name
 * @param {Object} [options] - Additional options
 * @param {string} [options.model_type='model2vec'] - Model type
 * @param {string} [options.model_revision='main'] - Model revision
 * @param {string} [options.tokenizer_revision='main'] - Tokenizer revision
 * @param {string} [options.dtype='fp32'] - Data type
 * @param {string} [options.device='wasm' | 'webgpu'] - Device (defaults to 'webgpu' if available, otherwise 'wasm')
 * @returns {Promise<number[][]>} - Text embeddings
 */
export async function embed(texts, model_name = "minishlab/potion-base-8M", options = {}) {
  const {
    model_type = "model2vec",
    model_revision = "main",
    tokenizer_revision = "main",
    device = navigator?.gpu ? "webgpu" : undefined, // use webgpu if available
    dtype = "fp32",
    raw = false,
  } = options;

  // Load model and tokenizer
  const model = await AutoModel.from_pretrained(model_name, {
    config: { model_type },
    revision: model_revision,
    device,
    dtype,
  });

  const tokenizer = await AutoTokenizer.from_pretrained(model_name, {
    revision: tokenizer_revision,
  });

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

  // Flatten input IDs
  const flattened_input_ids = input_ids.flat();

  // Create tensors and get embeddings
  const model_inputs = {
    input_ids: new Tensor("int64", flattened_input_ids, [flattened_input_ids.length]),
    offsets: new Tensor("int64", offsets, [offsets.length]),
  };

  const { embeddings } = await model(model_inputs);
  return raw ? embeddings : embeddings.tolist();
}

/**
 * Queries a document with a given query and returns the results
 * @param {string} document
 * @param {string} query
 * @returns {Promise<Array>} - Array of search results
 */
export async function queryDocument(document, query) {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
    keepSeparator: true,
  });
  const texts = await textSplitter.splitText(document);
  const { embeddings, similarities } = await getEmbeddings(texts, query);
  const results = texts.map((text, i) => ({
    text,
    embedding: embeddings[i],
    similarity: similarities ? similarities[0][i] : null,
  }));
  return results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
}
