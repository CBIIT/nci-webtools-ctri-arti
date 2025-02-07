import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { parseDocument } from "./parsers.js";

// Default model ID
export const DEFAULT_MODEL_ID = process.env.DEFAULT_MODEL_ID || "anthropic.claude-3-5-sonnet-20240620-v1:0";

export const DEFAULT_SYSTEM_PROMPT = `
You are a systematic problem solver who adjusts your analysis depth based on problem complexity. For simpler tasks, provide concise solutions. For complex problems, especially those involving code or logic, examine each component thoroughly.

When solving problems:
1. Start by explicitly stating all constraints and goals, quoting relevant parts of the problem description
2. Break complex problems into smaller components
3. For each component:
   - Begin with "Let's examine..."
   - Document your analysis path, including failed attempts
   - Note key insights with "Ah" or "Wait" 
   - Challenge assumptions with "But what if..."
   - Test ideas with concrete examples
   - If stuck, try new approaches with "Let's think differently..."
   - Question and verify conclusions

For debugging or complex analysis:
- Walk through each element sequentially
- Document your understanding of each piece
- Identify potential issues or edge cases
- Test hypotheses with examples
- Consider interactions between components
- Verify solutions against original requirements

Show your full reasoning process, including:
- Uncertainties and revisions
- Failed attempts and why they failed
- Connections between components
- Verification of solutions

Share your thought process in <think> tags, your draft response in <draft> tags, and your final response in <response> tags. Use natural language while maintaining technical precision. When you discover errors in your reasoning, acknowledge them openly and explain your corrections.`;

/**
 * Run a model with the given messages.
 * @param {string} modelId
 * @param {{role: "user" | "assistant" | "system", content: string}[] | string} messages
 * @returns
 */
export async function runModel(modelId = DEFAULT_MODEL_ID, messages = [], systemPrompt = DEFAULT_SYSTEM_PROMPT, toolConfig = undefined) {
  if (!messages || messages?.length === 0) {
    return null;
  }

  if (typeof messages === "string") {
    messages = [{ role: "user", content: [{ text: messages }] }];
  }

  const client = new BedrockRuntimeClient();
  const system = [{ text: systemPrompt }];
  const input = { modelId, messages, system, toolConfig };
  const command = new ConverseCommand(input);
  const response = await client.send(command);
  return response;
}

/**
 * Stream a model with the given messages.
 * @param {string} modelId
 * @param {any} messages
 * @returns {Promise<BedrockRuntimeClient.ConverseStreamCommandOutput>}
 */
export async function streamModel(modelId = DEFAULT_MODEL_ID,  messages = [], systemPrompt = DEFAULT_SYSTEM_PROMPT, tools = []) {

  if (!messages || messages?.length === 0) {
    return null;
  }

  if (typeof messages === "string") {
    messages = [{ role: "user", content: [{ text: messages }] }];
  }

  const client = new BedrockRuntimeClient();
  const system = [{ text: systemPrompt }];
  const toolConfig = tools.length > 0 ? { tools } : undefined;
  const input = { modelId, messages, system, toolConfig };

  const command = new ConverseStreamCommand(input);
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
