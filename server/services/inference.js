import bedrock from "./providers/bedrock.js";
import gemini from "./providers/gemini.js";
import { Model, Provider } from "./database.js";

export async function getModelProvider(value) {
  const providers = { bedrock, gemini };
  const model = await Model.findOne({ where: { value }, include: Provider });
  const provider = new providers[model?.Provider?.name];
  return { model, provider };
}

/**
 * Stream a conversation with an AI model by sending messages and receiving responses in a stream format.
 *
 * @param {string} modelId - The ID of the model to use (defaults to DEFAULT_MODEL_ID)
 * @param {Array|string} messages - Array of message objects or a string that will be converted to a user message
 * @param {string} systemPrompt - The system prompt to guide the model's behavior
 * @param {number} thoughtBudget - Token budget for the model's thinking process (0 disables thinking feature)
 * @param {Array} tools - Array of tools the model can use during the conversation
 * @returns {Promise<import("@aws-sdk/client-bedrock-runtime").ConverseStreamCommandOutput|import("@aws-sdk/client-bedrock-runtime").ConverseCommandOutput>} A promise that resolves to a stream of model responses
 */
export async function runModel({ model, messages, system: systemPrompt, tools = [], thoughtBudget = 0, stream = false }) {
  if (!model || !messages || messages?.length === 0) {
    return null;
  }

  // process messages to ensure they are in the correct format
  messages = messages.filter(Boolean);
  for (const message of messages) {
    if (!message.content.filter(Boolean).length) {
      message.content.push({ text: "_" });
    }
    for (const content of message.content.filter(Boolean)) {
      if (content.text?.trim().length === 0) {
        content.text = "_"; // prevent empty text content
      }
      const source = content.document?.source || content.image?.source;
      if (source?.bytes && typeof source.bytes === "string") {
        source.bytes = Uint8Array.from(Buffer.from(source.bytes, "base64"));
      }
    }
  }
  const cachePoint = { type: "default" };
  // cachePoints are not fully supported yet
  // messages.at(-1).content.push({ cachePoint });
  const { provider } = await getModelProvider(model);
  const system = systemPrompt ? [{ text: systemPrompt }, { cachePoint }] : undefined;
  const toolConfig = tools.length > 0 ? { tools: tools.concat([{ cachePoint }]) } : undefined;
  const inferenceConfig = thoughtBudget > 0 ? { maxTokens: 128_000 } : undefined;
  const thinking = { type: "enabled", budget_tokens: +thoughtBudget };
  const additionalModelRequestFields = thoughtBudget > 0 ? { thinking } : undefined;
  const input = { modelId: model, messages, system, toolConfig, inferenceConfig, additionalModelRequestFields };
  const response = stream ? provider.converseStream(input) : provider.converse(input);
  return await response;
}
