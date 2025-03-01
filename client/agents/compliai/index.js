import { onCleanup, createSignal } from "solid-js";
import { render } from "solid-js/web";
import html from "solid-js/html";
import { parse as parseMarkdown } from "marked";
import yaml from "yaml";
import { readStream, loadTTS, runTool, getClientContext, parseStreamingJson, fileToBase64 } from "./utils.js";
import { systemPrompt, tools } from "./config.js";
import { search, browse, code, splitFilename } from "./utils.js";

render(() => html`<${Page} />`, window.app);
loadTTS().then((tts) => (window.tts = tts)); // Load TTS in background

export default function Page() {
  const [messages, setMessages] = createSignal([]);
  const [activeMessage, setActiveMessage] = createSignal(null);
  const [loading, setLoading] = createSignal(true);

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.target?.closest("form")?.requestSubmit();
    }
  }

  async function handleSubmit(event) {
    event?.preventDefault();
    /** @type {HTMLFormElement} */
    const form = event.target;
    /** @type {string} */
    const message = form.message.value;
    /** @type {FileList} */
    const inputFiles = form.inputFiles.files;
    /** @type {boolean} */
    const reasoningMode = form.reasoningMode.checked;

    const userMessage = {
      role: "user",
      content: [{ text: message }],
    };
    if (inputFiles.length) {
      for (const file of inputFiles) {
        const imageTypes = ["png", "jpeg", "gif", "webp"];
        const documentTypes = ["pdf", "csv", "doc", "docx", "xls", "xlsx", "html", "txt", "md"];
        const validTypes = [...imageTypes, ...documentTypes];
        if (!validTypes) {
          alert(`Invalid file format. Valid formats include: ${validTypes}`);
          return;
        }
        let [name, format] = splitFilename(file.name);
        name = name.replace(/[^a-zA-Z0-9\s\[\]\(\)\-]/g, "_").replace(/\s{2,}/g, " "); // adhere to anthropic filename restrictions
        const bytes = await fileToBase64(file, true);
        const contentType = imageTypes.includes(format) ? "image" : "document";
        userMessage.content.push({
          [contentType]: {
            name,
            format,
            source: { bytes },
          },
        });
      }
    }

    form.message.value = "";
    form.inputFiles.value = "";
    setMessages((messages) => messages.concat([userMessage]));

    try {
      let isComplete = false;

      while (!isComplete) {
        setLoading(true);
        const response = await fetch("/api/model/stream", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: form.model.value,
            system: systemPrompt(getClientContext()),
            thoughtBudget: reasoningMode ? 4000 : 0,
            messages: messages(),
            tools,
          }),
        });
        /**
         * Please refer to this:
import { BedrockRuntimeClient, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime"; // ES Modules import
// const { BedrockRuntimeClient, ConverseStreamCommand } = require("@aws-sdk/client-bedrock-runtime"); // CommonJS import
const client = new BedrockRuntimeClient(config);
const input = { // ConverseStreamRequest
  modelId: "STRING_VALUE", // required
  messages: [ // Messages
    { // Message
      role: "user" || "assistant", // required
      content: [ // ContentBlocks // required
        { // ContentBlock Union: only one key present
          text: "STRING_VALUE",
          image: { // ImageBlock
            format: "png" || "jpeg" || "gif" || "webp", // required
            source: { // ImageSource Union: only one key present
              bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
            },
          },
          document: { // DocumentBlock
            format: "pdf" || "csv" || "doc" || "docx" || "xls" || "xlsx" || "html" || "txt" || "md", // required
            name: "STRING_VALUE", // required
            source: { // DocumentSource Union: only one key present
              bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
            },
          },
          
          toolUse: { // ToolUseBlock
            toolUseId: "STRING_VALUE", // required
            name: "STRING_VALUE", // required
            input: "DOCUMENT_VALUE", // required
          },
          toolResult: { // ToolResultBlock
            toolUseId: "STRING_VALUE", // required
            content: [ // ToolResultContentBlocks // required
              { // ToolResultContentBlock Union: only one key present
                json: "DOCUMENT_VALUE",
                text: "STRING_VALUE",
                image: {
                  format: "png" || "jpeg" || "gif" || "webp", // required
                  source: {//  Union: only one key present
                    bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
                  },
                },
                document: {
                  format: "pdf" || "csv" || "doc" || "docx" || "xls" || "xlsx" || "html" || "txt" || "md", // required
                  name: "STRING_VALUE", // required
                  source: {//  Union: only one key present
                    bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
                  },
                },
              },
            ],
            status: "success" || "error",
          },
        },
      ],
    },
  ],
};
const command = new ConverseStreamCommand(input);
const response = await client.send(command);


        */

        setLoading(false);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const decoder = new TextDecoder();
        let assistantMessage = {
          role: "assistant",
          content: [],
        };
        for await (const chunk of readStream(response)) {
          const values = decoder
            .decode(chunk, { stream: true })
            .trim()
            .split("\n")
            .map((e) => JSON.parse(e));

          for (const value of values) {

            /** 
            const sampleValue = {
              // ConverseStreamResponse
              messageStart: {
                // MessageStartEvent
                role: "user" || "assistant", // required
              },
              contentBlockStart: {
                // ContentBlockStartEvent
                start: {
                  // ContentBlockStart Union: only one key present
                  toolUse: {
                    // ToolUseBlockStart
                    toolUseId: "STRING_VALUE", // required
                    name: "STRING_VALUE", // required
                  },
                },
                contentBlockIndex: Number("int"), // required
              },
              contentBlockDelta: {
                // ContentBlockDeltaEvent
                delta: {
                  // ContentBlockDelta Union: only one key present
                  text: "STRING_VALUE",
                  toolUse: {
                    // ToolUseBlockDelta
                    input: "STRING_VALUE", // required
                  },
                },
                contentBlockIndex: Number("int"), // required
              },
              contentBlockStop: {
                // ContentBlockStopEvent
                contentBlockIndex: Number("int"), // required
              },
              messageStop: {
                // MessageStopEvent
                stopReason: "end_turn" || "tool_use" || "max_tokens" || "stop_sequence" || "guardrail_intervened" || "content_filtered", // required
                additionalModelResponseFields: "DOCUMENT_VALUE",
              },
              internalServerException: {
                // InternalServerException
                message: "STRING_VALUE",
              },
              modelStreamErrorException: {
                // ModelStreamErrorException
                message: "STRING_VALUE",
                originalStatusCode: Number("int"),
                originalMessage: "STRING_VALUE",
              },
              validationException: {
                // ValidationException
                message: "STRING_VALUE",
              },
              throttlingException: {
                // ThrottlingException
                message: "STRING_VALUE",
              },
              serviceUnavailableException: {
                // ServiceUnavailableException
                message: "STRING_VALUE",
              },
            };
            const sampleContentBlock = { // ContentBlock Union: only one key present
              text: "STRING_VALUE",
              image: { // ImageBlock
                format: "png" || "jpeg" || "gif" || "webp", // required
                source: { // ImageSource Union: only one key present
                  bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
                },
              },
              document: { // DocumentBlock
                format: "pdf" || "csv" || "doc" || "docx" || "xls" || "xlsx" || "html" || "txt" || "md", // required
                name: "STRING_VALUE", // required
                source: { // DocumentSource Union: only one key present
                  bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
                },
              },
              video: { // VideoBlock
                format: "mkv" || "mov" || "mp4" || "webm" || "flv" || "mpeg" || "mpg" || "wmv" || "three_gp", // required
                source: { // VideoSource Union: only one key present
                  bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
                  s3Location: { // S3Location
                    uri: "STRING_VALUE", // required
                    bucketOwner: "STRING_VALUE",
                  },
                },
              },
              toolUse: { // ToolUseBlock
                toolUseId: "STRING_VALUE", // required
                name: "STRING_VALUE", // required
                input: "DOCUMENT_VALUE", // required
              },
              toolResult: { // ToolResultBlock
                toolUseId: "STRING_VALUE", // required
                content: [ // ToolResultContentBlocks // required
                  { // ToolResultContentBlock Union: only one key present
                    json: "DOCUMENT_VALUE",
                    text: "STRING_VALUE",
                    image: {
                      format: "png" || "jpeg" || "gif" || "webp", // required
                      source: {//  Union: only one key present
                        bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
                      },
                    },
                    document: {
                      format: "pdf" || "csv" || "doc" || "docx" || "xls" || "xlsx" || "html" || "txt" || "md", // required
                      name: "STRING_VALUE", // required
                      source: {//  Union: only one key present
                        bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
                      },
                    },
                  },
                ],
                status: "success" || "error",
              },
            };
            */
            const { contentBlockStart, contentBlockDelta, contentBlockStop, messageStop } = value;
            const toolUse = contentBlockStart?.start?.toolUse;
            const stopReason = messageStop?.stopReason;

            if (toolUse) {
              toolUse.input = "";
              assistantMessage.content.push({ toolUse });
              setActiveMessage(() => structuredClone(assistantMessage));
            } else if (contentBlockDelta) {
              const { delta, contentBlockIndex } = contentBlockDelta;
              const { text, toolUse, reasoningContent } = delta;
              if (reasoningContent) {
                if (!assistantMessage.content[contentBlockIndex]?.reasoningContent?.text) {
                  assistantMessage.content[contentBlockIndex] = { reasoningContent: { text: "" } };
                }
                assistantMessage.content[contentBlockIndex].reasoningContent.text += reasoningContent.text;
              } else if (text) {
                if (!assistantMessage.content[contentBlockIndex]?.text) {
                  assistantMessage.content[contentBlockIndex] = { text: "" };
                }
                assistantMessage.content[contentBlockIndex].text += text;
              } else if (toolUse) {
                assistantMessage.content[contentBlockIndex].toolUse.input += toolUse.input;
              }
              setActiveMessage(() => structuredClone(assistantMessage));
            } else if (contentBlockStop) {
              const { contentBlockIndex } = contentBlockStop;
              const { toolUse } = assistantMessage.content[contentBlockIndex];
              if (toolUse) {
                toolUse.input = JSON.parse(toolUse.input);
                setActiveMessage(() => structuredClone(assistantMessage));
              }
            } else if (stopReason) {
              setActiveMessage(null);
              setMessages((messages) => messages.concat([structuredClone(assistantMessage)]));
              if (stopReason === "tool_use") {
                setLoading(true);
                const toolUses = assistantMessage.content.filter((c) => c.toolUse).map((c) => c.toolUse);
                const toolResults = await Promise.all(toolUses.map((t) => runTool(t, { search, browse, code })));
                const toolResultsMessage = { role: "user", content: toolResults.map((r) => ({ toolResult: r })) };
                setMessages((messages) => messages.concat([toolResultsMessage]));
                setLoading(false);
              } else {
                isComplete = true;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("An error occurred while sending the message. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  return html`
    <div class="flex-grow-1">
      ${() =>
        messages().length
          ? [
              messages().map((message) => html`<${Message} message=${message} />`),
              html`<${Message} message=${activeMessage()} active=${true} />`,
              loading() && html`<dna-spinner style="display: block; height: 1.1rem; width: 100%; margin: 1rem 0; opacity: 0.5" />`,
            ]
          : html`<div class="text-center my-5">
              <h1 class="display-6">Welcome to CompliAI</h1>
              <p class="fw-light fs-5">To get started, send a message below.</p>
            </div>`}
    </div>
    <form onSubmit=${handleSubmit} class="card">
      <textarea
        class="form-control form-control-sm border-0 bg-transparent shadow-0"
        onKeyDown=${handleKeyDown}
        id="message"
        name="message"
        placeholder="Enter message (Shift + Enter for new line)"
        rows="3"
        autofocus
        required />

      <div class="d-flex justify-content-between">
        <input
          type="file"
          id="inputFiles"
          name="inputFiles"
          class="form-control form-control-sm w-auto bg-transparent border-transparent"
          accept="image/*,.pdf,.csv,.doc,.docx,.xls,.xlsx,.html,.txt,.md"
          multiple />

        <div class="input-group w-auto align-items-center">
          <div class="form-check form-switch mb-0 form-control-sm d-flex align-item-center">
            <input class="form-check-input cursor-pointer me-1" type="checkbox" role="switch" id="reasoningMode" name="reasoningMode" />
            <label class="form-check-label text-secondary cursor-pointer" for="reasoningMode">
              <span class="visually-hidden">Enable Reasoning Mode</span>
              <svg xmlns="http://www.w3.org/2000/svg" height="16" fill="currentColor" viewBox="0 0 640 512">
                <path
                  d="M176 48l0 148.8c0 20.7-5.8 41-16.6 58.7L100 352l225.8 0c.1 .1 .2 .1 .2 .2c-16.6 10.6-26.7 31.6-20 53.3c4 12.9 9.4 25.5 16.4 37.6s15.2 23.1 24.4 33c15.7 16.9 39.6 18.4 57.2 8.7l0 .9c0 6.7 1.5 13.5 4.2 19.7c-9 4.3-19 6.6-29.7 6.6L69.4 512C31.1 512 0 480.9 0 442.6c0-12.8 3.6-25.4 10.3-36.4L118.5 230.4c6.2-10.1 9.5-21.7 9.5-33.5L128 48l-8 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l40 0L288 0l40 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-8 0 0 148.8c0 11.8 3.3 23.5 9.5 33.5L336 241c-4.9 6.4-9.5 13.1-13.6 20.3c-5.2 9.1-9.6 18.4-13.1 27.9l-20.7-33.6c-10.9-17.7-16.6-38-16.6-58.7L272 48l-96 0zM447.3 203.4c-6.8 1.5-11.3 7.8-11.3 14.8l0 17.4c0 7.9-4.9 15-11.7 18.9c-6.8 3.9-15.2 4.5-22 .6l-13.6-7.8c-6.1-3.5-13.7-2.7-18.5 2.4c-7.5 8.1-14.3 17.2-20.1 27.2s-10.3 20.4-13.5 31c-2.1 6.7 1.1 13.7 7.2 17.2l14 8.1c6.5 3.8 10.1 11 10.1 18.6s-3.5 14.8-10.1 18.6l-14 8.1c-6.1 3.5-9.2 10.5-7.2 17.2c3.3 10.6 7.8 21 13.5 31s12.5 19.1 20.1 27.2c4.8 5.1 12.5 5.9 18.5 2.4l13.5-7.8c6.8-3.9 15.2-3.3 22 .6c6.9 3.9 11.7 11 11.7 18.9l0 17.4c0 7 4.5 13.3 11.3 14.8c10.5 2.4 21.5 3.7 32.7 3.7s22.2-1.3 32.7-3.7c6.8-1.5 11.3-7.8 11.3-14.8l0-17.7c0-7.8 4.8-14.8 11.6-18.7c6.7-3.9 15.1-4.5 21.8-.6l13.8 7.9c6.1 3.5 13.7 2.7 18.5-2.4c7.6-8.1 14.3-17.2 20.1-27.2s10.3-20.4 13.5-31c2.1-6.7-1.1-13.7-7.2-17.2l-14.4-8.3c-6.5-3.7-10-10.9-10-18.4s3.5-14.7 10-18.4l14.4-8.3c6.1-3.5 9.2-10.5 7.2-17.2c-3.3-10.6-7.8-21-13.5-31s-12.5-19.1-20.1-27.2c-4.8-5.1-12.5-5.9-18.5-2.4l-13.8 7.9c-6.7 3.9-15.1 3.3-21.8-.6c-6.8-3.9-11.6-10.9-11.6-18.7l0-17.7c0-7-4.5-13.3-11.3-14.8c-10.5-2.4-21.5-3.7-32.7-3.7s-22.2 1.3-32.7 3.7zM480 303.7a48 48 0 1 1 0 96 48 48 0 1 1 0-96z" />
              </svg>
            </label>
          </div>
          <select class="form-select form-select-sm border-0 bg-transparent cursor-pointer" name="model" id="model" required>
            <option value="us.anthropic.claude-3-7-sonnet-20250219-v1:0" selected>Sonnet</option>
            <option value="us.anthropic.claude-3-5-haiku-20241022-v1:0">Haiku</option>
          </select>
          <button class="btn btn-secondary btn-sm" type="submit" style="border-radius: 0 0 var(--bs-border-radius-sm) 0">Send</button>
        </div>
      </div>
    </form>
  `;
}

export function Message({ message, active }) {
  if (!message) return null;
  const isAssistant = message.role === "assistant" || message.toolUse;

  // Filter and join text content
  const textContent = message.content
    .filter((c) => c.text)
    .map((c) => c.text)
    .join("\n");

  // Filter tool use content and results
  const toolCalls = message.content
    .filter((c) => c.toolUse || c.toolResult)
    .map((c) => ({
      ...c.toolUse,
      result: c.toolResult?.content[0]?.json?.results,
    }));

  // Helper to check if input is just code
  const isCodeOnly = (input) => {
    const keys = Object.keys(input);
    return keys.length === 1 && keys[0] === "code";
  };

  // Helper to truncate long strings
  const truncate = (str, maxLength = 2000) => {
    if (!str || str.length <= maxLength) return str;
    return str.slice(0, maxLength) + "\n...";
  };

  // Helper to format tool result
  const formatResult = (result) => {
    if (result === null || result === undefined) return "No result";
    try {
      if (typeof result !== "string") result = JSON.stringify(result, null, 2);
      if (result?.results?.[0]?.url) {
        result = result.results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet }));
      }
      const json = parseStreamingJson(result);
      return truncate(yaml.stringify(json).split("\n").slice(0, 4).join("\n"));
    } catch (error) {
      console.error(error);
      return truncate(result.toString());
    }
  };

  return html`
    <div class="d-flex flex-wrap position-relative">
      ${textContent?.trim().length > 0 &&
      html`
        <span
          class=${["markdown card mb-2 p-2 small", isAssistant ? "bg-light w-100 border-secondary" : "bg-white"].join(" ")}
          innerHTML=${parseMarkdown(textContent)}></span>
        ${isAssistant &&
        window.MODELS_LOADED &&
        !active &&
        html`<button onClick=${() => playAudio(textContent)} class="position-absolute border-0 p-0 me-1 bg-transparent top-0 end-0">
          ▷
        </button>`}
      `}
      ${toolCalls.map(
        (tool) => html`
          ${tool.name &&
          tool.input &&
          html`
            <div class="card w-100 mb-2 border-secondary">
              <div class="card-header bg-secondary bg-opacity-10 py-1 px-2">
                <small class="text-secondary">Tool Call: ${tool.name}</small>
              </div>
              <div class="card-body p-2">
                ${isCodeOnly(tool.input)
                  ? html`<pre class="mb-0"><code>${tool.input.code}</code></pre>`
                  : html`<pre class="mb-0"><code>${formatResult(tool.input, null, 2)}</code></pre>`}
              </div>
            </div>
          `}
          ${tool.result &&
          html`
            <div class="card w-100 mb-2 border-success">
              <div class="card-header bg-success bg-opacity-10 py-1 px-2">
                <small class="text-success">Tool Result</small>
              </div>
              <div class="card-body p-2">
                <pre class="mb-0"><code>${formatResult(tool.result)}</code></pre>
              </div>
            </div>
          `}
        `
      )}
    </div>
  `;
}
