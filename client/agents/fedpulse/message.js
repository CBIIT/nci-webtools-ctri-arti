import html from "solid-js/html";
import { parse } from "marked";
import { stringify } from "yaml";
import { playAudio } from "./utils.js";

export default function Message({ message, messages = [], active = false, defaultClass = "small markdown shadow-sm rounded mb-3 p-2" }) {
  if (!message) return null;
  const getToolResult = (messages, toolUseId) =>
    messages?.find((m) => m.content[0].toolResult?.toolUseId === toolUseId)?.content[0].toolResult?.content[0]?.json?.results;

  return html`
    <div class="d-flex flex-wrap position-relative">
      ${() =>
        message.content.map((c) => {
          if (c.text) {
            return html`
              <span
                class=${[defaultClass, "mb-3", message.role === "user" ? "bg-light" : "w-100 font-serif bg-white"].join(" ")}
                innerHTML=${parse(c.text)?.trim()}></span>
              <button
                onClick=${() => playAudio(c.text)}
                class="position-absolute border-0 p-0 me-1 bg-transparent top-0 end-0"
                hidden=${message.role === "user" || active || !window.tts}>
                ▷
              </button>
            `;
          } else if (c.toolUse) {
            return html`
              <span class=${[defaultClass, "w-100 text-prewrap overflow-auto bg-white"].join(" ")} style="max-height: 200px">
                <pre class="mb-0 text-muted">
                ${[
                    [c.toolUse.name, stringify(c.toolUse.input)].join(" "),
                    stringify(getToolResult(messages, c.toolUse.toolUseId))?.replace(/[]/g, " ")?.trim(),
                  ]
                    .filter(Boolean)
                    .join("\n")
                    .trim()}
                </pre
                >
              </span>
            `;
          }
        })}
    </div>
  `;
}
