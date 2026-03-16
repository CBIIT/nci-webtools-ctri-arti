import { AutoModel, AutoTokenizer, Tensor } from "@huggingface/transformers";

let cachedEmbed = null;

export async function createEmbedder(model_name = "minishlab/potion-base-8M") {
  const model = await AutoModel.from_pretrained(model_name, {
    config: { model_type: "model2vec" },
    dtype: "fp32",
  });
  const tokenizer = await AutoTokenizer.from_pretrained(model_name);

  return async function embed(texts) {
    const { input_ids } = await tokenizer(texts, {
      add_special_tokens: false,
      return_tensor: false,
    });
    const offsets = [0];
    for (let i = 0; i < input_ids.length - 1; i++) {
      offsets.push(offsets[i] + input_ids[i].length);
    }
    const flat = input_ids.flat();
    const { embeddings } = await model({
      input_ids: new Tensor("int64", flat, [flat.length]),
      offsets: new Tensor("int64", offsets, [offsets.length]),
    });
    return embeddings.tolist();
  };
}

export async function getEmbedder() {
  if (!cachedEmbed) cachedEmbed = await createEmbedder();
  return cachedEmbed;
}
