import { createSignal } from "solid-js";
import { readStream, runTool, getClientContext, autoscroll } from "./utils/utils.js";
import { detectFileType, fileToBase64, splitFilename, readFile } from "./utils/parsers.js";
import { systemPrompt, tools } from "./config.js";

export function useSubmitMessage() {
  const [messages, setMessages] = createSignal([]);
  const [conversation, setConversation] = createSignal({ id: null, title: "" });
  const [conversations, setConversations] = createSignal([]);
  const [activeMessage, setActiveMessage] = createSignal(null);
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
        const imageTypes = ["png", "jpeg", "gif", "webp"];
        const documentTypes = ["pdf", "csv", "doc", "docx", "xls", "xlsx", "html", "txt", "md"];
        // (Optionally validate file type here)
        let [name, format] = splitFilename(file.name);
        const originalFormat = format;
        // Sanitize filename (adhering to any restrictions)
        name = name.replace(/[^a-zA-Z0-9\s\[\]\(\)\-]/g, "_").replace(/\s{2,}/g, " ");
        const bytes = await fileToBase64(file, true);
        const contentType = imageTypes.includes(format) ? "image" : "document";
        const fileType = detectFileType(await readFile(file, "arrayBuffer"));
        const isText = fileType === "TEXT";
        if (!documentTypes.concat(imageTypes).includes(format)) format = "txt";
        const localFile = `file:${name}.${originalFormat}`;
        try {
          localStorage.setItem(localFile, isText ? await readFile(file) : bytes);
        } catch (error) {
          console.error("Error saving file to local storage:", error);
        }
        const byteLengthLimit = 1024 * 1024 * 5; // 5MB
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
            thoughtBudget: reasoningMode ? 24_000 : 0,
            stream: true,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const decoder = new TextDecoder();
        let assistantMessage = { role: "assistant", content: [] };

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
              // Initialize tool call input
              toolUse.input = "";
              assistantMessage.content.push({ toolUse });
              setActiveMessage(structuredClone(assistantMessage));
            } else if (contentBlockDelta) {
              const { contentBlockIndex, delta } = contentBlockDelta;
              const { reasoningContent, text, toolUse } = delta;
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
              setActiveMessage(structuredClone(assistantMessage));
            } else if (contentBlockStop) {
              const { contentBlockIndex } = contentBlockStop;
              const { toolUse } = assistantMessage.content[contentBlockIndex];
              if (toolUse) {
                toolUse.input = JSON.parse(toolUse.input);
                setActiveMessage(structuredClone(assistantMessage));
              }
            } else if (stopReason) {
              setActiveMessage(null);
              setMessages((prev) => [...prev, structuredClone(assistantMessage)]);
              if (stopReason === "tool_use") {
                const toolUses = assistantMessage.content.filter((c) => c.toolUse).map((c) => c.toolUse);
                const toolResults = await Promise.all(toolUses.map((t) => runTool(t)));
                const toolResultsMessage = {
                  role: "user",
                  content: toolResults.map((r) => ({ toolResult: r })),
                };
                setMessages((prev) => [...prev, toolResultsMessage]);
              } else {
                isComplete = true;
              }
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

  return { messages, conversation, updateConversation, conversations, activeMessage, loading, submitMessage };
}
