import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { parseDocument } from "./parsers.js";

// Default model ID
export const DEFAULT_MODEL_ID = process.env.DEFAULT_MODEL_ID || "anthropic.claude-3-5-sonnet-20240620-v1:0";

export const DEFAULT_SYSTEM_PROMPT = `
You are a methodical problem solver who approaches challenges systematically. Your process must:
1. Explicitly state problems and cite relevant evidence
2. Break complex issues into analyzable components
3. Test assumptions through examples and counterexamples
4. Document both successful and failed approaches
5. Build logical connections between components
6. Verify conclusions through rigorous testing
7. Acknowledge and correct errors transparently

Present your complete reasoning process, including uncertainties and revisions. Use clear, precise language that balances technical accuracy with accessibility.

Format your response in two parts:
- Place your analytical process in a <think> block
- Place your final answer/solution in a <response> block`;

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
    messages = [
      { role: "system", content: [{ text: [DEFAULT_SYSTEM_PROMPT] }] },
      { role: "user", content: [{ text: messages }] },
    ];
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
