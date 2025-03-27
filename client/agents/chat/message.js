import html from "solid-js/html";
import { parse } from "marked";
import { stringify } from "yaml";

export default function Message({ message, messages = [], active = false, defaultClass = "small markdown shadow-sm rounded mb-3 p-2" }) {
  if (!message) return null;
  const getToolResult = (messages, toolUseId) =>
    messages?.find((m) => m.content?.[0]?.toolResult?.toolUseId === toolUseId)?.content[0].toolResult?.content[0]?.json?.results;
  const renderMessageContent = (c, m) => m.role === "user" ? ({innerText: c.text.trim()}) : ({innerHTML: parse(c.text)?.trim()});

  return html`
    <div class="d-flex flex-wrap position-relative">
      ${() =>
        message.content.map((c) => {
          if (c.text) {
            return html`
              <span
                class=${[defaultClass, "mb-3", message.role === "user" ? "bg-light" : "w-100 font-serif bg-white"].join(" ")}
                ...${renderMessageContent(c, message)}></span>
            `;
          } 

          else if (c.reasoningContent?.reasoningText?.text) {
            return html`
              <span class=${[defaultClass, "w-100overflow-auto bg-white"].join(" ")} style="max-height: 200px">
                <pre class="mb-0 text-prewrap text-muted">Internal Thoughts: ${c.reasoningContent.reasoningText.text}</pre>
              </span>
            `;
          }
          
          else if (c.toolUse) {
            return html`
              <span class=${[defaultClass, "w-100 overflow-auto bg-white"].join(" ")} style="max-height: 200px">
                <pre class="mb-0 text-prewrap text-muted">
                ${[
                    [c.toolUse.name, stringify(c.toolUse.input)].join(" "),
                    stringify(getToolResult(messages, c.toolUse.toolUseId))?.replace(/[]/g, " ")?.trim(),
                  ]
                    .filter(Boolean)
                    .join("\n")
                    .trim()}
                </pre>
              </span>
            `;
          }
        })}
    </div>
  `;
}
