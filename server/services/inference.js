import bedrock from "./providers/bedrock.js";
import gemini from "./providers/gemini.js";
import { Model, Provider } from "./database.js";

export async function getModelProvider(value) {
  const providers = { bedrock, gemini };
  const model = await Model.findOne({ where: { value }, include: Provider });
  const provider = new providers[model?.Provider?.name]();
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
    for (const content of message.content) {
      if (!content) continue;
      // prevent empty text content
      if (content.text?.trim().length === 0) {
        content.text = "_";
      }
      // transform base64 encoded bytes to Uint8Array
      const source = content.document?.source || content.image?.source;
      if (source?.bytes && typeof source.bytes === "string") {
        source.bytes = Uint8Array.from(Buffer.from(source.bytes, "base64"));
      }
      // ensure tool call inputs are in the correct format
      if (content.toolUse) {
        const toolUseId = content.toolUse.toolUseId;
        if (typeof content.toolUse.input === "string") {
          content.toolUse.input = { text: content.toolUse.input };
        }
        // if tool results don't exist, interleave an empty result
        if (!messages.find((m) => m.content.find((c) => c.toolResult?.toolUseId === toolUseId))) {
          const toolResultsIndex = messages.indexOf(message) + 1;
          const content = [{ json: { results: {} } }];
          const toolResult = { toolUseId, content };
          const toolResultsMessage = { role: "user", content: [{ toolResult }] };
          messages.splice(toolResultsIndex, 0, toolResultsMessage);
        }
      }
    }
  }
  // try to add a cache point to the largest message in the second half of the conversation (usually stays the same)
  const cachePoint = { type: "default" };
  const largestMessage = messages.slice(Math.floor(messages.length / 2)).reduce((acc, curr) => JSON.stringify(acc).length > JSON.stringify(curr).length ? acc : curr, messages[0]);
  const largestMessageLength = JSON.stringify(largestMessage).length;
  if (largestMessageLength > 6000) {
    // console.log('Adding cache point to largest message', largestMessage);
    largestMessage.content.push({ cachePoint });
  }
  const {
    model: { maxOutput },
    provider,
  } = await getModelProvider(model);
  const maxTokens = Math.min(maxOutput, thoughtBudget + 2000);
  const system = systemPrompt ? [{ text: systemPrompt }, { cachePoint }] : undefined;
  const toolConfig = tools.length > 0 ? { tools: tools.concat([{ cachePoint }]) } : undefined;
  const inferenceConfig = thoughtBudget > 0 ? { maxTokens } : undefined;
  const thinking = { type: "enabled", budget_tokens: +thoughtBudget };
  const additionalModelRequestFields = thoughtBudget > 0 ? { thinking } : undefined;
  const input = { modelId: model, messages, system, toolConfig, inferenceConfig, additionalModelRequestFields };
  const response = stream ? provider.converseStream(input) : provider.converse(input);
  return await response;
}
