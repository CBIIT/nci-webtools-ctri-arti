import {
  ApplyGuardrailCommand,
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

export default class BedrockProvider {
  constructor() {
    this.client = new BedrockRuntimeClient();
  }

  /**
   * Sends a non-streaming Converse request to AWS Bedrock.
   * @param {import("@aws-sdk/client-bedrock-runtime").ConverseCommandInput>} input - The Bedrock ConverseRequest payload. (e.g., { modelId, messages, system, toolConfig, inferenceConfig })
   * @returns {Promise<import("@aws-sdk/client-bedrock-runtime").ConverseCommandOutput>} The full response from the Bedrock Converse API.
   */
  async converse(input) {
    const command = new ConverseCommand(input);
    return await this.client.send(command);
  }

  /**
   * Sends a streaming Converse request to AWS Bedrock.
   * @param {import("@aws-sdk/client-bedrock-runtime").ConverseCommandInput} input - The Bedrock ConverseRequest payload.
   * @returns {AsyncGenerator<import("@aws-sdk/client-bedrock-runtime").ConverseStreamOutput>} An async generator yielding Bedrock ConverseStreamOutput events.
   */
  async converseStream(input) {
    const command = new ConverseStreamCommand(input);
    return await this.client.send(command);
  }

  /**
   * Applies AWS Bedrock Guardrail to check text content.
   * @param {string} guardrailId - The guardrail identifier
   * @param {string} guardrailVersion - The guardrail version (e.g., "1", "DRAFT")
   * @param {string|string[]} text - The text or array of texts to check
   * @param {string} source - The source type: "INPUT" or "OUTPUT"
   * @returns {Promise<{action: string, outputs: Array, assessments: Array}>} The guardrail result
   */
  async applyGuardrail(guardrailId, guardrailVersion, text, source = "INPUT") {
    const texts = Array.isArray(text) ? text : [text];
    const content = texts.map((t) => ({ text: { text: t } }));

    const command = new ApplyGuardrailCommand({
      guardrailIdentifier: guardrailId,
      guardrailVersion,
      source,
      content,
    });

    const response = await this.client.send(command);
    return {
      action: response.action, // "NONE" or "GUARDRAIL_INTERVENED"
      outputs: response.outputs,
      assessments: response.assessments,
      usage: response.usage,
    };
  }

  /**
   * Generates embeddings for text using AWS Bedrock embedding models.
   * Supports Amazon Titan and Cohere embedding models.
   * @param {string} modelId - The embedding model ID (e.g., "amazon.titan-embed-text-v1", "cohere.embed-english-v3")
   * @param {string|string[]} text - The text or array of texts to embed
   * @returns {Promise<{embedding: number[]|number[][], inputTokenCount?: number}>} The embedding vector(s)
   */
  async embed(modelId, text) {
    let body;

    // Format request body based on model type
    if (modelId.includes("titan")) {
      // Amazon Titan Embeddings format
      body = JSON.stringify({
        inputText: Array.isArray(text) ? text[0] : text,
      });
    } else if (modelId.includes("cohere")) {
      // Cohere Embed format
      const texts = Array.isArray(text) ? text : [text];
      body = JSON.stringify({
        texts,
        input_type: "search_document",
        truncate: "END",
      });
    } else {
      throw new Error(`Unsupported embedding model: ${modelId}`);
    }

    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body,
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Normalize response format
    if (modelId.includes("titan")) {
      return {
        embedding: responseBody.embedding,
        inputTokenCount: responseBody.inputTextTokenCount,
      };
    } else if (modelId.includes("cohere")) {
      // Cohere returns embeddings array (one per input text)
      return {
        embedding: responseBody.embeddings,
        inputTokenCount: responseBody.meta?.billed_units?.input_tokens,
      };
    }

    return responseBody;
  }
}
