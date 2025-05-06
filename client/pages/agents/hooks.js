import { createSignal } from "solid-js";
import { fileToBase64, readFile, splitFilename } from "./utils/parsers.js";
import { readStream, runTool, getClientContext, autoscroll } from "./utils/utils.js";
import { systemPrompt, tools } from "./config.js";

export function useSubmitAiMessage() {
  const [messages, setMessages] = createSignal([]);
  const [assistantMessage, setAssistantMessage] = createSignal({ role: "assistant", content: [] }, { equals: false });
  const [loading, setLoading] = createSignal(false);

  /**
   * Submit a message along with optional files.
   * @param {Object} params
   * @param {string} params.message - The text message.
   * @param {FileList} [params.inputFiles] - Any files attached.
   * @param {boolean} params.reasoningMode - Whether reasoning mode is enabled.
   * @param {string} params.model - The model to use.
   */
  async function submitMessage({ system, tools, message, inputFiles, reasoningMode, model }) {
    const userMessage = {
      role: "user",
      content: [{ type: "text", text: message }],
    };

    for (const file of inputFiles || []) {
      const byteLengthLimit = 1024 * 1024 * 5; // 5MB file limit
      if (file.size > byteLengthLimit) return;
      const mimeType = file.type;
      const data = await fileToBase64(file);
      const type = mimeType.includes("image/") ? "image" : "data";
      const content = {mimeType, [type]: data};
      userMessage.content.push(content);
    }

    // Update the state with the user message
    setMessages((prev) => [...prev, userMessage]);

    try {
      let isComplete = false;
      setLoading(true);

      while (!isComplete) {
        const response = await fetch("/api/model", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            system,
            tools,
            messages: messages(),
            thoughtBudget: reasoningMode ? 24_000 : 0,
            stream: true,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const decoder = new TextDecoder();
        const types = {
          text: '0',
          reasoning: 'g',
          redacted_reasoning: 'i',
          reasoning_signature: 'j',
          source: 'h',
          file: 'k',
          data: '2',
          annotation: '8',
          error: '3',
          tool_call_streaming_start: 'b',
          tool_call_delta: 'c',
          tool_call: '9',
          tool_result: 'a',
          start_step: 'f',
          finish_step: 'e',
          finish_message: 'd',
        };

        // Process streaming chunks from the API
        for await (const chunk of readStream(response)) {
          const values = decoder
            .decode(chunk, { stream: true })
            .trim()
            .split("\n")
            .map(line => {
              let i = line.indexOf(':')
              const k = line.slice(0, i);
              const v = JSON.parse(line.slice(i + 1))
              return [k, v];
            });
          
          let step = -1;
          let typeMap = {};
          for (let k in types) {
            typeMap[types[k]] = k;
          }
          for (const [type, value] of values) {
            console.log(type, typeMap[type], value);
            if (type === types.start_step) {
              step ++;
              m.content[step] = {}
            }

            if (type === types.text) {
              setAssistantMessage(m => {
                // m.content[step]
              })
            }

          }
          isComplete = true;

        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Optionally set error state here
    } finally {
      setLoading(false);
    }
  }

  return { messages, loading, submitMessage };
}

export function useSubmitMessage() {
  const [messages, setMessages] = createSignal([]);
  const [conversation, setConversation] = createSignal({ id: null, title: "" });
  const [conversations, setConversations] = createSignal([]);
  const [assistantMessage, setAssistantMessage] = createSignal({ role: "assistant", content: [] }, { equals: false });
  const [loading, setLoading] = createSignal(false);
  const updateConversation = (c) => setConversation((prev) => (c ? { ...prev, ...c } : null));

  /**
   * Submit a message along with optional files.
   * @param {Object} params
   * @param {string} params.message - The text message.
   * @param {FileList} [params.inputFiles] - Any files attached.
   * @param {boolean} params.reasoningMode - Whether reasoning mode is enabled.
   * @param {string} params.model - The model to use.
   */
  async function submitMessage({ message, inputFiles, reasoningMode, model, context = {}, reset = () => {} }) {
    const userMessage = {
      role: "user",
      content: [{ text: message }],
    };

    if (!messages().length) {
      setConversation({ id: 1, title: message });
    }

    if (inputFiles && inputFiles.length) {
      for (const file of inputFiles) {
        const byteLengthLimit = 1024 * 1024 * 5; // 5MB
        const imageTypes = ["png", "jpeg", "gif", "webp"];
        const documentTypes = ["pdf", "csv", "doc", "docx", "xls", "xlsx", "html", "txt", "md"];
        let [name, format] = splitFilename(file.name);
        name = name.replace(/[^a-zA-Z0-9\s\[\]\(\)\-]/g, "_").replace(/\s{2,}/g, " ");
        const bytes = await readFile(file, "dataURL");
        const contentType = imageTypes.includes(format) ? "image" : "document";
        if (!documentTypes.concat(imageTypes).includes(format)) format = "txt";
        if (file.size > byteLengthLimit) {
          console.warn(`File ${file.name} exceeds the 5MB limit and will not be sent.`);
          continue;
        }
        userMessage.content.push({
          [contentType]: { name, format, source: { bytes } },
        });
      }
    }

    reset?.();

    // Update the state with the user message
    setMessages((prev) => [...prev, userMessage]);

    try {
      let isComplete = false;
      setLoading(true);

      while (!isComplete) {
        const response = await fetch("/api/model/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            tools,
            system: systemPrompt(getClientContext(context)),
            messages: messages(),
            thoughtBudget: reasoningMode ? 32_000 : 0,
            stream: true,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const decoder = new TextDecoder();
        // let assistantMessage = { role: "assistant", content: [] };

        // Process streaming chunks from the API
        for await (const chunk of readStream(response)) {
          const values = decoder
            .decode(chunk, { stream: true })
            .trim()
            .split("\n")
            .map((e) => JSON.parse(e));

          for (const value of values) {
            const { contentBlockStart, contentBlockDelta, contentBlockStop, messageStop } = value;
            const toolUse = contentBlockStart?.start?.toolUse;
            const stopReason = messageStop?.stopReason;

            if (toolUse) {
              setAssistantMessage((assistantMessage) => {
                // Initialize tool call input
                toolUse.input = "";
                assistantMessage ||= { role: "assistant", content: [] };
                assistantMessage.content.push({ toolUse });
                return assistantMessage;
              });
            } else if (contentBlockDelta) {
              setAssistantMessage((assistantMessage) => {
                const { contentBlockIndex, delta } = contentBlockDelta;
                const { reasoningContent, text, toolUse } = delta;
                assistantMessage ||= { role: "assistant", content: [] };

                if (reasoningContent) {
                  if (!assistantMessage.content[contentBlockIndex]?.reasoningContent) {
                    assistantMessage.content[contentBlockIndex] = {
                      reasoningContent: {
                        reasoningText: {
                          text: "",
                          signature: "",
                        },
                        redactedContent: "",
                      },
                    };
                  }
                  if (reasoningContent.text) {
                    assistantMessage.content[contentBlockIndex].reasoningContent.reasoningText.text += reasoningContent.text;
                  } else if (reasoningContent.signature) {
                    assistantMessage.content[contentBlockIndex].reasoningContent.reasoningText.signature += reasoningContent.signature;
                    delete assistantMessage.content[contentBlockIndex].redactedContent;
                  } else if (reasoningContent.redactedContent) {
                    assistantMessage.content[contentBlockIndex].reasoningContent.redactedContent += reasoningContent.redactedContent;
                    delete assistantMessage.content[contentBlockIndex].reasoningContent.reasoningText;
                  }
                } else if (text) {
                  if (!assistantMessage.content[contentBlockIndex]?.text) {
                    assistantMessage.content[contentBlockIndex] = { text: "" };
                  }
                  assistantMessage.content[contentBlockIndex].text += text;
                } else if (toolUse) {
                  assistantMessage.content[contentBlockIndex].toolUse.input += toolUse.input;
                }
                return assistantMessage;
              });
            } else if (contentBlockStop) {
              setAssistantMessage((assistantMessage) => {
                const { contentBlockIndex } = contentBlockStop;
                const { toolUse } = assistantMessage.content[contentBlockIndex];
                if (toolUse) {
                  toolUse.input = JSON.parse(toolUse.input);
                }
                return assistantMessage;
              });
            } else if (stopReason) {
              setMessages((prev) => [...prev, assistantMessage()]);
              if (stopReason === "tool_use") {
                const toolUses = assistantMessage()
                  .content.filter((c) => c.toolUse)
                  .map((c) => c.toolUse);
                const toolResults = await Promise.all(toolUses.map((t) => runTool(t)));
                const toolResultsMessage = {
                  role: "user",
                  content: toolResults.map((r) => ({ toolResult: r })),
                };
                setMessages((prev) => [...prev, toolResultsMessage]);
              } else {
                isComplete = true;
              }
              setAssistantMessage(null);
            }
            autoscroll();
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Optionally set error state here
    } finally {
      setLoading(false);
    }
  }

  return { messages, conversation, updateConversation, conversations, activeMessage: assistantMessage, loading, submitMessage };
}
