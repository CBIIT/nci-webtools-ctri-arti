import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { fileToBase64, splitFilename } from "./utils/parsers.js";
import { readStream, runTool, getClientContext, autoscroll } from "./utils/utils.js";
import { systemPrompt, tools } from "./config.js";
import { jsonToXml } from "./utils/xml.js";

export function useChat() {
  const [messages, setMessages] = createStore([]);
  const [conversation, setConversation] = createStore({ id: null, title: "", messages });
  const [conversations, setConversations] = createStore([]);
  const [loading, setLoading] = createSignal(false);

  /**
   * Submit a message along with optional files.
   * @param {Object} params
   * @param {string} params.message - The text message.
   * @param {FileList} [params.inputFiles] - Any files attached.
   * @param {boolean} params.reasoningMode - Whether reasoning mode is enabled.
   * @param {string} params.model - The model to use.
   */
  async function submitMessage({ message, inputFiles, reasoningMode, model, context = {}, reset = () => {} }) {
    const text = jsonToXml({
      message: {
        text: message,
        metadata: {
          timestamp: new Date().toLocaleString(),
          reminders: 'Use the think tool for complex topics, search and browse for current information, update memory files with key details, and include APA-style source citations.',
        }
      }
    });
    const userMessage = {
      role: "user",
      content: [{ text }],
    };

    if (!messages.length) {
      setConversation({ id: Math.random().toString(36).substr(2, 9), title: message });
    }

    if (inputFiles && inputFiles.length) {
      for (const file of inputFiles) {
        const byteLengthLimit = 1024 * 1024 * 5; // 5MB
        const imageTypes = ["png", "jpeg", "gif", "webp"];
        const documentTypes = ["pdf", "csv", "doc", "docx", "xls", "xlsx", "html", "txt", "md"];
        let [name, format] = splitFilename(file.name);
        name = name.replace(/[^a-zA-Z0-9\s\[\]\(\)\-]/g, "_").replace(/\s{2,}/g, " ");
        const bytes = await fileToBase64(file, true);
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

    // Update the state with the user message
    setMessages(messages.length, userMessage);
    reset?.();

    try {
      let isComplete = false;
      setLoading(true);

      while (!isComplete) {
        const response = await fetch("/api/model", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            tools,
            system: systemPrompt(getClientContext(context)),
            messages,
            thoughtBudget: reasoningMode ? 8000 : 0,
            stream: true,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const decoder = new TextDecoder();
        let assistantMessage = { role: "assistant", content: [] };
        setMessages(messages.length, assistantMessage);

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
              toolUse.input = "";
              const { contentBlockIndex } = contentBlockStart;
              setMessages(messages.length - 1, "content", contentBlockIndex, { toolUse });
            } else if (contentBlockDelta) {
              const { contentBlockIndex, delta } = contentBlockDelta;
              const { reasoningContent, text, toolUse } = delta;

              if (reasoningContent) {
                if (!messages.at(-1).content[contentBlockIndex]?.reasoningContent) {
                  setMessages(messages.length - 1, "content", contentBlockIndex, {
                    reasoningContent: {
                      reasoningText: {
                        text: "",
                        signature: "",
                      },
                      redactedContent: "",
                    },
                  });
                }
                if (reasoningContent.text) {
                  setMessages(
                    messages.length - 1,
                    "content",
                    contentBlockIndex,
                    "reasoningContent",
                    "reasoningText",
                    "text",
                    (prev) => prev + reasoningContent.text
                  );
                } else if (reasoningContent.signature) {
                  setMessages(
                    messages.length - 1,
                    "content",
                    contentBlockIndex,
                    "reasoningContent",
                    "reasoningText",
                    "signature",
                    (prev) => prev + reasoningContent.signature
                  );
                  setMessages(messages.length - 1, "content", contentBlockIndex, "reasoningContent", "redactedContent", undefined);
                } else if (reasoningContent.redactedContent) {
                  setMessages(
                    messages.length - 1,
                    "content",
                    contentBlockIndex,
                    "reasoningContent",
                    "redactedContent",
                    (prev) => prev + reasoningContent.redactedContent
                  );
                  setMessages(messages.length - 1, "content", contentBlockIndex, "reasoningContent", "reasoningText", undefined);
                }
              } else if (text) {
                if (!messages.at(-1).content[contentBlockIndex]?.text) {
                  setMessages(messages.length - 1, "content", contentBlockIndex, { text: "" });
                }
                setMessages(messages.length - 1, "content", contentBlockIndex, "text", (prev) => prev + text);
              } else if (toolUse) {
                setMessages(messages.length - 1, "content", contentBlockIndex, "toolUse", "input", (prev) => prev + toolUse.input);
              }
            } else if (contentBlockStop) {
              const { contentBlockIndex } = contentBlockStop;
              const { toolUse } = messages.at(-1).content[contentBlockIndex];
              if (toolUse) setMessages(messages.length - 1, "content", contentBlockIndex, "toolUse", "input", (prev) => JSON.parse(prev));
            } else if (stopReason) {
              if (stopReason === "tool_use") {
                const toolUses = messages
                  .at(-1)
                  .content.filter((c) => c.toolUse)
                  .map((c) => c.toolUse);
                const toolResults = await Promise.all(toolUses.map((t) => runTool(t)));
                const toolResultsMessage = {
                  role: "user",
                  content: toolResults.map((r) => ({ toolResult: r })),
                };
                setMessages(messages.length, toolResultsMessage);
              } else {
                isComplete = true;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setLoading(false);
    }
  }

  return { messages, submitMessage, conversation, setConversation, conversations, setConversations, loading };
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
        const bytes = await fileToBase64(file, true);
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
        const response = await fetch("/api/model", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            tools,
            system: systemPrompt(getClientContext(context)),
            messages: messages(),
            thoughtBudget: reasoningMode ? 8000 : 0,
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
