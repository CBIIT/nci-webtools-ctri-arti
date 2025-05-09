import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand
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
}
