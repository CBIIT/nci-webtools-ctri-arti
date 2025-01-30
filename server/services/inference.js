import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime"; // ES Modules import
import { parseDocument } from "./parsers.js";

// Default model ID
export const DEFAULT_MODEL_ID = process.env.DEFAULT_MODEL_ID || "anthropic.claude-3-5-sonnet-20240620-v1:0"

/**
 * Run a model with the given messages.
 * @param {string} modelId
 * @param {{role: "user" | "assistant" | "system", content: string}[] | string} messages
 * @returns
 */
export async function runModel(modelId = DEFAULT_MODEL_ID, messages = []) {
  if (!messages || messages?.length === 0) {
    return null;
  }

  if (typeof messages === "string") {
    messages = [{ role: "user", content: [{ text: messages }] }];
  }

  const client = new BedrockRuntimeClient();
  const input = { modelId, messages };
  
  const command = new ConverseCommand(input);
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
