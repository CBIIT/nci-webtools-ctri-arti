import html from "solid-js/html";
import { parse } from "marked";
import { stringify } from "yaml";
import { downloadText } from "./utils/utils.js";

export default function Message({
  message,
  messages = [],
  active = false,
  defaultClass = "small markdown shadow-sm rounded mb-3 p-2 position-relative",
}) {
  if (!message) return null;
  const getToolResult = (messages, toolUseId) =>
    messages?.find((m) => m.content?.[0]?.toolResult?.toolUseId === toolUseId)?.content[0].toolResult?.content[0]?.json?.results;
  const renderMessageContent = (c, m) => (m.role === "user" ? { innerText: c.text.trim() } : { innerHTML: parse(c.text)?.trim() });
  const debug = location.hostname === "localhost";

  return html`
    <div class="d-flex flex-wrap position-relative hover-visible-parent">
      ${() =>
        message.content.map((c) => {
          if (c.text) {
            return html`
              <span class=${[defaultClass, "mb-3", message.role === "user" ? "bg-light text-prewrap" : "w-100 bg-white"].join(" ")}>
                <button
                  class="btn btn-sm btn-outline-light hover-visible  position-absolute top-0 end-0 border-0 opacity-50"
                  onClick=${() => downloadText("results.txt", c.text)}
                  hidden=${message.role === "user"}>
                  💾
                </button>
                <span ...${renderMessageContent(c, message)}></span>
              </span>
            `;
          } else if (c.reasoningContent?.reasoningText?.text) {
            return html`
              <details class=${[defaultClass, "w-100 overflow-auto bg-white"].join(" ")} style="max-height: 200px">
                <summary>Reasoning...</summary>
                <div class="text-prewrap">${c.reasoningContent.reasoningText.text}</div>
              </details>
            `;
          } else if (c.toolUse) {
            const { name, input, toolUseId } = c.toolUse;
            const result = getToolResult(messages, toolUseId);

            switch (c.toolUse.name) {
              case "think":
                return html`
                  <details class=${[defaultClass, "w-100 overflow-auto bg-white"].join(" ")} style="max-height: 200px">
                    <summary>Reasoning...</summary>
                    <div class="text-prewrap">${c.toolUse.input?.thought}</div>
                  </details>
                `;
              case "code":
                return html`
                  <span class=${[defaultClass, "w-100 overflow-auto bg-white"].join(" ")}>
                    <details class=${["markdown text-prewrap text-muted"].join(" ")}>
                      <summary>Writing Code...</summary>
                      <pre class="small mb-0">${input?.source}</pre>
                    </details>
                    ${result?.height > 0 &&
                    html`<iframe srcdoc=${result?.html} height=${result?.height + 20 || "auto"} style="width: 100%; border: none;"></iframe>
                      <button
                        class="btn btn-sm btn-outline-light hover-visible  position-absolute top-0 end-0 border-0 opacity-50"
                        onClick=${() => downloadText("results.html", result?.html)}>
                        💾</button
                      >}`}
                    <pre class="mb-0">${result?.logs?.map((log) => [`[${log.type}]`].concat(log.content).join(" ")).join("\n")}</pre>
                  </span>
                `;
              case "browse":
                return html`
                  <details class=${[defaultClass, "w-100 overflow-auto bg-white"].join(" ")}>
                    <summary>Browsing <a target="_blank" rel="noopener noreferrer" href=${input.url}>${input.url}</a></summary>
                    <small class="fw-semibold">${input?.topic}</small>
                    <div class="small" innerHTML=${parse(result || "")}></div>
                  </details>
                `;
              case "editor":
                return html`
                  <details open="open" class=${[defaultClass, "w-100 overflow-auto bg-white"].join(" ")}>
                    <summary>File: ${input?.path}</summary>
                    ${input?.file_text &&
                    html`<button
                        class="btn btn-sm btn-outline-light hover-visible  position-absolute top-0 end-0 border-0 opacity-50"
                        onClick=${() => downloadText(input?.path, input.file_text)}>
                        💾
                      </button>
                      <div class="small text-prewrap">${input?.file_text}</div>`}
                    ${input?.old_str && html`<div class="small text-prewrap"><strong>Replacing: </strong>${input?.old_str}</div>`}
                    ${input?.new_str &&
                    html`<button
                        class="btn btn-sm btn-outline-light hover-visible  position-absolute top-0 end-0 border-0 opacity-50"
                        onClick=${() => downloadText(input?.path, input.new_str)}>
                        💾
                      </button>
                      <div class="small text-prewrap"><strong> With: </strong>${input?.new_str}</div>`}
                    <div class="small text-prewrap">
                      <button
                        class="btn btn-sm btn-outline-light hover-visible  position-absolute top-0 end-0 border-0 opacity-50"
                        onClick=${() => downloadText(input.path, result.replace(/^\s*\d+\s*\:\s*/g, ""))}
                        hidden=${() => input?.command !== "view"}>
                        💾
                      </button>
                      ${result}
                    </div>
                  </details>
                `;
              default:
                const defaultResults = [[name, stringify(input)].join(" "), stringify(result)?.trim()].filter(Boolean).join("\n").trim();
                return html`
                  <span class=${[defaultClass, "w-100 overflow-auto bg-white"].join(" ")} style="max-height: 200px">
                    <button
                      class="btn btn-sm btn-outline-light hover-visible  position-absolute top-0 end-0 border-0 opacity-50"
                      onClick=${() => downloadText("results.txt", defaultResults)}>
                      💾
                    </button>
                    <pre class="mb-0 text-prewrap text-muted">${defaultResults}</pre>
                  </span>
                `;
            }
          }
        })}
    </div>
  `;
}
