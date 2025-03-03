import { createSignal } from "solid-js";
import { readStream, runTool, fileToBase64, splitFilename, ecfr, federalRegister } from "./utils.js";
import { systemPrompt, tools } from "./config.js";
import { search, browse, code, getClientContext } from "./utils.js";

export function useSubmitMessage() {
  const [messages, setMessages] = createSignal([]);
  const [activeMessage, setActiveMessage] = createSignal(null);
  const [loading, setLoading] = createSignal(false);

  /**
   * Submit a message along with optional files.
   * @param {Object} params
   * @param {string} params.message - The text message.
   * @param {FileList} [params.inputFiles] - Any files attached.
   * @param {boolean} params.reasoningMode - Whether reasoning mode is enabled.
   * @param {string} params.model - The model to use.
   */
  async function submitMessage({ message, inputFiles, reasoningMode, model }) {
    // Build the user message payload
    const userMessage = {
      role: "user",
      content: [{ text: message }],
    };

    if (inputFiles && inputFiles.length) {
      for (const file of inputFiles) {
        const imageTypes = ["png", "jpeg", "gif", "webp"];
        const documentTypes = ["pdf", "csv", "doc", "docx", "xls", "xlsx", "html", "txt", "md"];
        // (Optionally validate file type here)
        let [name, format] = splitFilename(file.name);
        // Sanitize filename (adhering to any restrictions)
        name = name.replace(/[^a-zA-Z0-9\s\[\]\(\)\-]/g, "_").replace(/\s{2,}/g, " ");
        const bytes = await fileToBase64(file, true);
        const contentType = imageTypes.includes(format) ? "image" : "document";
        userMessage.content.push({
          [contentType]: { name, format, source: { bytes } },
        });
      }
    }

    // Update the state with the user message
    setMessages((prev) => [...prev, userMessage]);

    try {
      let isComplete = false;
      setLoading(true);

      while (!isComplete) {
        const response = await fetch("/api/model/stream", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            system: systemPrompt(getClientContext()),
            thoughtBudget: reasoningMode ? 4000 : 0,
            messages: messages(),
            tools,
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
              setActiveMessage(structuredClone(assistantMessage));
            } else if (contentBlockStop) {
              const { contentBlockIndex } = contentBlockStop;
              const { toolUse } = assistantMessage.content[contentBlockIndex];
              if (toolUse) {
                toolUse.input = JSON.parse(toolUse.input);
                setActiveMessage(structuredClone(assistantMessage));
              }
            } else if (stopReason) {
              // Finalize the message
              setActiveMessage(null);
              setMessages((prev) => [...prev, structuredClone(assistantMessage)]);
              if (stopReason === "tool_use") {
                setLoading(true);
                const toolUses = assistantMessage.content
                  .filter((c) => c.toolUse)
                  .map((c) => c.toolUse);
                const toolResults = await Promise.all(
                  toolUses.map((t) => runTool(t, { search, browse, code, ecfr, federalRegister }))
                );
                const toolResultsMessage = {
                  role: "user",
                  content: toolResults.map((r) => ({ toolResult: r })),
                };
                setMessages((prev) => [...prev, toolResultsMessage]);
              } else {
                isComplete = true;
              }
            }
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

  return { messages, activeMessage, loading, submitMessage };
}
