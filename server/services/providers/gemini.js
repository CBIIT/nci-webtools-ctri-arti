import { GoogleGenAI } from "@google/genai";

/**
 * GeminiProvider
 *
 * A provider that translates Bedrock-style API calls to Google's Gemini API.
 * It adheres to a common provider interface with `converse` and `converseStream` methods,
 * expecting Bedrock-style input and returning Bedrock-style output after translation.
 */
export default class GeminiProvider {
  /**
   * @param {object} geminiInstance - An initialized GoogleGenerativeAI client instance from @google/generative-ai.
   */
  constructor(geminiInstance) {
    this.geminiAI = geminiInstance || new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.activeToolCallNames = new Map();
  }

  uint8ArrayToBase64(bytes) {
    return Buffer.from(bytes).toString("base64");
  }
  
  base64ToUint8Array(base64) {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  _prepareToolNameMapping(bedrockMessages) {
    this.activeToolCallNames.clear();
    bedrockMessages?.forEach((msg) => {
      if (msg.role === "assistant" && msg.content) {
        msg.content.forEach((contentBlock) => {
          if (contentBlock.toolUse && contentBlock.toolUse.toolUseId && contentBlock.toolUse.name) {
            this.activeToolCallNames.set(contentBlock.toolUse.toolUseId, contentBlock.toolUse.name);
          }
        });
      }
    });
  }

  toGeminiRequest(bedrockConverseInput) {
    this._prepareToolNameMapping(bedrockConverseInput.messages);
    const geminiRequest = { contents: [], generationConfig: {}, tools: [] };

    bedrockConverseInput.messages?.forEach((brMsg) => {
      const geminiRole = brMsg.role === "user" ? "user" : "model";
      const geminiParts = [];
      brMsg.content?.forEach((content) => {
        if (content.text !== undefined) {
          geminiParts.push({ text: content.text });
        } else if (content.image?.source?.bytes) {
          const mimeType = `image/${content.image.format || "png"}`;
          geminiParts.push({ inlineData: { mimeType, data: this.uint8ArrayToBase64(content.image.source.bytes) } });
        } else if (content.document?.source?.bytes) {
          const format = content.document.format || "octet-stream";
          const mimeType = `application/${format}`; // Basic mapping
          geminiParts.push({ inlineData: { mimeType, data: this.uint8ArrayToBase64(content.document.source.bytes) } });
        } else if (content.toolResult && brMsg.role === "user") {
          const toolName = this.activeToolCallNames.get(content.toolResult.toolUseId);
          if (toolName) {
            const resultOutput =
              content.toolResult.content?.find((c) => c.json !== undefined)?.json ??
              content.toolResult.content?.find((c) => c.text !== undefined)?.text ??
              "";
            geminiParts.push({ functionResponse: { name: toolName, response: { output: resultOutput } } });
          }
        } else if (content.toolUse && brMsg.role === "assistant") {
          geminiParts.push({ functionCall: { name: content.toolUse.name, args: content.toolUse.input || {} } });
        }
      });
      if (geminiParts.length > 0) geminiRequest.contents.push({ role: geminiRole, parts: geminiParts });
    });

    if (bedrockConverseInput.system?.length > 0) {
      const systemTextParts = bedrockConverseInput.system.filter((block) => block.text !== undefined).map((block) => block.text);
      if (systemTextParts.length > 0) {
        geminiRequest.systemInstruction = { parts: [{ text: systemTextParts.join("\n") }] };
      }
    }

    const ic = bedrockConverseInput.inferenceConfig;
    if (ic) {
      if (ic.maxTokens !== undefined) geminiRequest.generationConfig.maxOutputTokens = ic.maxTokens;
      if (ic.temperature !== undefined) geminiRequest.generationConfig.temperature = ic.temperature;
      if (ic.topP !== undefined) geminiRequest.generationConfig.topP = ic.topP;
      if (ic.stopSequences?.length > 0) geminiRequest.generationConfig.stopSequences = ic.stopSequences;
    }

    if (bedrockConverseInput.toolConfig?.tools) {
      const functionDeclarations = bedrockConverseInput.toolConfig.tools
        .filter((brTool) => brTool.toolSpec)
        .map((brTool) => ({
          name: brTool.toolSpec.name,
          description: brTool.toolSpec.description || "No description provided.",
          parameters: brTool.toolSpec.inputSchema?.json || { type: "OBJECT", properties: {} },
        }));
      if (functionDeclarations.length > 0) {
        geminiRequest.tools = [{ functionDeclarations }];
        if (bedrockConverseInput.toolConfig.toolChoice) {
          const choice = bedrockConverseInput.toolConfig.toolChoice;
          geminiRequest.toolConfig = { functionCallingConfig: {} };
          if (choice.auto) geminiRequest.toolConfig.functionCallingConfig.mode = "AUTO";
          else if (choice.any) geminiRequest.toolConfig.functionCallingConfig.mode = "ANY";
          else if (choice.tool?.name) {
            geminiRequest.toolConfig.functionCallingConfig.mode = "ANY";
            geminiRequest.toolConfig.functionCallingConfig.allowedFunctionNames = [choice.tool.name];
          }
        }
      }
    }
    if (bedrockConverseInput.additionalModelRequestFields) {
      try {
        const additionalFields =
          typeof bedrockConverseInput.additionalModelRequestFields === "string"
            ? JSON.parse(bedrockConverseInput.additionalModelRequestFields)
            : bedrockConverseInput.additionalModelRequestFields;
        Object.assign(geminiRequest, additionalFields);
      } catch (e) {
        console.warn("GeminiProvider: Failed to parse additionalModelRequestFields:", e);
      }
    }
    return geminiRequest;
  }

  _mapGeminiFinishReason(geminiReason, lastPartWasToolCall) {
    if (lastPartWasToolCall && (geminiReason === "STOP" || !geminiReason)) return "tool_use";
    switch (geminiReason) {
      case "STOP":
        return "end_turn";
      case "MAX_TOKENS":
        return "max_tokens";
      case "SAFETY":
      case "RECITATION":
      case "LANGUAGE":
      case "IMAGE_SAFETY":
        return "content_filtered";
      case "BLOCKLIST":
      case "PROHIBITED_CONTENT":
      case "SPII":
        return "guardrail_intervened";
      case "MALFORMED_FUNCTION_CALL":
        return "end_turn";
      default:
        return "end_turn";
    }
  }

  _extractUsage(geminiUsageMetadata, candidateTokenCount = 0) {
    if (!geminiUsageMetadata) return { inputTokens: 0, outputTokens: candidateTokenCount, totalTokens: candidateTokenCount };
    return {
      inputTokens: geminiUsageMetadata.promptTokenCount || 0,
      outputTokens: candidateTokenCount || geminiUsageMetadata.candidatesTokenCount || 0,
      totalTokens: geminiUsageMetadata.totalTokenCount || 0,
      ...(geminiUsageMetadata.cachedContentTokenCount && { cacheReadInputTokens: geminiUsageMetadata.cachedContentTokenCount }),
    };
  }

  toBedrockConverseOutput(geminiFullResponse, bedrockModelId, metrics = {}) {
    const bedrockResponse = {
      output: { message: { role: "assistant", content: [] } },
      usage: {},
      metrics,
      stopReason: "end_turn",
    };
    if (geminiFullResponse?.promptFeedback?.blockReason) {
      bedrockResponse.stopReason = "guardrail_intervened";
      bedrockResponse.output.message.content.push({ text: `Request blocked by Gemini: ${geminiFullResponse.promptFeedback.blockReason}` });
      bedrockResponse.usage = this._extractUsage(geminiFullResponse.usageMetadata, 0);
      return bedrockResponse;
    }
    if (!geminiFullResponse?.candidates?.length) {
      bedrockResponse.stopReason = "content_filtered";
      bedrockResponse.output.message.content.push({ text: "No candidates from Gemini." });
      bedrockResponse.usage = this._extractUsage(geminiFullResponse.usageMetadata, 0);
      return bedrockResponse;
    }
    const candidate = geminiFullResponse.candidates[0];
    let lastPartWasToolCall = false;
    candidate.content?.parts?.forEach((part) => {
      lastPartWasToolCall = false;
      if (part.text !== undefined) bedrockResponse.output.message.content.push({ text: part.text });
      else if (part.functionCall) {
        bedrockResponse.output.message.content.push({
          toolUse: {
            toolUseId: `gemini_tool_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: part.functionCall.name,
            input: part.functionCall.args || {},
          },
        });
        lastPartWasToolCall = true;
      } else if (part.inlineData?.mimeType?.startsWith("image/")) {
        bedrockResponse.output.message.content.push({
          image: { format: part.inlineData.mimeType.split("/")[1] || "png", source: { bytes: this.base64ToUint8Array(part.inlineData.data) } },
        });
      }
    });
    if (bedrockResponse.output.message.content.length === 0 && !lastPartWasToolCall) {
      bedrockResponse.output.message.content.push({ text: "" });
    }
    bedrockResponse.stopReason = this._mapGeminiFinishReason(candidate.finishReason, lastPartWasToolCall);
    bedrockResponse.usage = this._extractUsage(geminiFullResponse.usageMetadata, candidate.tokenCount);
    return bedrockResponse;
  }

  async *toBedrockConverseStreamOutput(geminiStreamResultPromise, bedrockModelId, metricsStartTime) {
    const messageId = `gemini-msg-${Date.now()}`;
    let currentContentBlockIndex = 0;
    let activeTextContentBlock = false;
    let lastPartWasToolCallForStream = false;
    try {
      const { stream: geminiStream, response: fullResponsePromise } = await geminiStreamResultPromise;
      yield { type: "messageStart", messageStart: { role: "assistant", messageId } };
      for await (const chunk of geminiStream) {
        lastPartWasToolCallForStream = false;
        if (chunk.promptFeedback?.blockReason) {
          if (activeTextContentBlock) yield { type: "contentBlockStop", contentBlockStop: { contentBlockIndex } };
          break;
        }
        for (const candidate of chunk.candidates || []) {
          for (const part of candidate.content?.parts || []) {
            if (part.text !== undefined) {
              if (!activeTextContentBlock) {
                yield { type: "contentBlockStart", contentBlockStart: { contentBlockIndex, start: { text: {} } } };
                activeTextContentBlock = true;
              }
              yield { type: "contentBlockDelta", contentBlockDelta: { contentBlockIndex, delta: { text: part.text } } };
              lastPartWasToolCallForStream = false;
            } else if (part.functionCall) {
              if (activeTextContentBlock) {
                yield { type: "contentBlockStop", contentBlockStop: { contentBlockIndex } };
                activeTextContentBlock = false;
                currentContentBlockIndex++;
              }
              const toolUseId = `gemini_tool_${Date.now()}_${currentContentBlockIndex}`;
              yield {
                type: "contentBlockStart",
                contentBlockStart: { contentBlockIndex, start: { toolUse: { toolUseId, name: part.functionCall.name } } },
              };
              yield {
                type: "contentBlockDelta",
                contentBlockDelta: { contentBlockIndex, delta: { toolUse: { input: part.functionCall.args || {} } } },
              };
              yield { type: "contentBlockStop", contentBlockStop: { contentBlockIndex } };
              lastPartWasToolCallForStream = true;
              currentContentBlockIndex++;
            }
          }
        }
      }
      if (activeTextContentBlock) yield { type: "contentBlockStop", contentBlockStop: { contentBlockIndex } };

      const finalGeminiResponse = await fullResponsePromise;
      let stopReason = "end_turn";
      let finalCandidateTokenCount = 0;
      if (finalGeminiResponse.promptFeedback?.blockReason) {
        stopReason = "guardrail_intervened";
      } else if (finalGeminiResponse.candidates?.length) {
        const finalCandidate = finalGeminiResponse.candidates[0];
        finalCandidateTokenCount = finalCandidate.tokenCount || 0;
        stopReason = this._mapGeminiFinishReason(finalCandidate.finishReason, lastPartWasToolCallForStream);
      }
      yield { type: "messageStop", messageStop: { stopReason } };
      yield {
        type: "metadata",
        metadata: {
          usage: this._extractUsage(finalGeminiResponse.usageMetadata, finalCandidateTokenCount),
          metrics: { latencyMs: Date.now() - metricsStartTime },
        },
      };
    } catch (error) {
      console.error("GeminiProvider Stream Conversion Error:", error.message, error.stack);
      yield { type: "error", error: { internalServerError: { message: `Stream Conversion Error: ${error.message}` } } };
      yield { type: "metadata", metadata: { usage: this._extractUsage(null), metrics: { latencyMs: Date.now() - metricsStartTime } } };
    }
  }

  /**
   * Implements the non-streaming converse method for Gemini,
   * translating Bedrock-style input/output.
   * @param {object} bedrockInput - The Bedrock ConverseRequest-like payload.
   * @returns {Promise<object>} Bedrock-formatted ConverseResponse.
   */
  async converse(bedrockInput) {
    const geminiRequestPayload = this.toGeminiRequest(bedrockInput);
    // The modelId for Gemini is expected to be a Gemini model ID (e.g., "gemini-1.5-pro-latest")
    // which is passed within bedrockInput.modelId.
    const geminiModel = this.geminiAI.getGenerativeModel({ model: bedrockInput.modelId });
    const startTime = Date.now();

    try {
      const geminiSdkResponse = await geminiModel.generateContent(geminiRequestPayload);
      return this.toBedrockConverseOutput(
        geminiSdkResponse.response, // Pass the inner 'response' object from Gemini SDK
        bedrockInput.modelId,
        { latencyMs: Date.now() - startTime }
      );
    } catch (error) {
      console.error("AwsBedrockGeminiProvider 'converse' error:", error);
      // Return a Bedrock-like error structure
      return {
        output: { message: { role: "assistant", content: [{ text: `Error calling Gemini: ${error.message}` }] } },
        stopReason: "error", // Or more specific if discernible from Gemini error
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        metrics: { latencyMs: Date.now() - startTime },
        error: { name: error.name || "GeminiConverseError", message: error.message },
      };
    }
  }

  /**
   * Implements the streaming converseStream method for Gemini,
   * translating Bedrock-style input and yielding Bedrock-style stream output.
   * @param {object} bedrockInput - The Bedrock ConverseRequest-like payload.
   * @returns {AsyncGenerator<object>} AsyncGenerator yielding Bedrock-formatted ConverseStreamOutput events.
   */
  async converseStream(bedrockInput) {
    const geminiRequestPayload = this.toGeminiRequest(bedrockInput);
    const geminiModel = this.geminiAI.getGenerativeModel({ model: bedrockInput.modelId });
    const startTime = Date.now();

    // Note: We don't `await` here because `generateContentStream` itself returns the promise for the stream object
    // and `toBedrockConverseStreamOutput` is designed to take this promise.
    try {
      const geminiStreamResultPromise = geminiModel.generateContentStream(geminiRequestPayload);
      // toBedrockConverseStreamOutput handles awaiting the promise and then iterating the stream
      return this.toBedrockConverseStreamOutput(geminiStreamResultPromise, bedrockInput.modelId, startTime);
    } catch (error) {
      console.error("AwsBedrockGeminiProvider 'converseStream' setup error:", error);
      // This catch is for errors in *initiating* the stream with Gemini.
      // Errors during streaming are handled inside toBedrockConverseStreamOutput.
      async function* errorStream() {
        yield { type: "error", error: { internalServerError: { message: `Gemini stream initiation error: ${error.message}` } } };
        yield { type: "metadata", metadata: { usage: {}, metrics: { latencyMs: Date.now() - startTime } } };
      }
      return errorStream();
    }
  }
}
