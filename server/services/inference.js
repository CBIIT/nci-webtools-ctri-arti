import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { parseDocument } from "./parsers.js";

/** Default Bedrock Model ID */
export const DEFAULT_MODEL_ID = process.env.DEFAULT_MODEL_ID;

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
export async function runModel(
  modelId = DEFAULT_MODEL_ID,
  messages = [],
  systemPrompt = "You are proactive, curious, and decisive. You communicate warmly with thoughtful examples, keeping responses concise yet insightful. You show genuine interest while focusing precisely on what people need.",
  thoughtBudget = 0,
  tools = [],
  stream = false
) {
  if (!messages || messages?.length === 0) {
    return null;
  }

  if (typeof messages === "string") {
    messages = [{ role: "user", content: [{ text: messages }] }];
  }

  // process messages to ensure they are in the correct format
  const cachePoint = { type: "default" };

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
  messages.at(-1).content.push({ cachePoint });

  const client = new BedrockRuntimeClient();
  const system = [{ text: systemPrompt }, { cachePoint }];
  const toolConfig = tools.length > 0 ? { tools: tools.concat([{ cachePoint }]) } : undefined;
  const inferenceConfig = thoughtBudget > 0 ? { maxTokens: 128_000 } : undefined;
  const performanceConfig = { latency: modelId.includes("haiku") ? "optimized" : "standard" };
  const thinking = { type: "enabled", budget_tokens: +thoughtBudget };
  const additionalModelRequestFields = thoughtBudget > 0 ? { thinking } : undefined;
  const input = { modelId, messages, system, toolConfig, inferenceConfig, performanceConfig, additionalModelRequestFields };

  const command = stream ? new ConverseStreamCommand(input) : new ConverseCommand(input);
  const response = await client.send(command);
  return response;
}

/**
 * Run a model with the given prompt and document.
 * @param {string} modelId
 * @param {string} prompt
 * @param {{originalname: string, buffer: Buffer, mimetype: string}} document
 * @returns {Promise<any>}
 */
export async function processDocument(modelId, prompt, document = null) {
  const startTime = Date.now();
  try {
    const text = document ? await parseDocument(document.buffer, document.mimetype) : "";
    const userMessage = prompt + "\n" + text;
    const messages = [{ role: "user", content: [{ text: userMessage }] }];
    const results = await runModel(modelId, messages);
    const endTime = Date.now();
    const duration = endTime - startTime;
    return { document: document.originalname, modelId, prompt, text, results, startTime, endTime, duration };
  } catch (error) {
    console.error(error);
    return { document: document.originalname, modelId, prompt, error: error.message, startTime };
  }
}

/**
 * Run a model with the given prompt and documents.
 * @param {string} modelId
 * @param {string} prompt
 * @param {{originalname: string, buffer: Buffer, mimetype: string}[]} documents
 * @returns {Promise<any[]>}
 */
export async function processDocuments(modelId, prompt, documents) {
  return await Promise.all(documents.map(async (document) => await processDocument(modelId, prompt, document)));
}
