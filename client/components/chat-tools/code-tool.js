import { Show } from "solid-js";
import html from "solid-js/html";

import { CodeXml, Download } from "lucide-solid";

import { downloadText } from "../../utils/files.js";
import { getToolResult } from "../../utils/tools.js";

import ToolHeader from "./tool-header.js";

export default function CodeTool(props) {
  const lang = props.message?.toolUse?.input?.language || "";
  const ext =
    {
      javascript: ".js",
      typescript: ".ts",
      html: ".html",
      css: ".css",
      json: ".json",
    }[lang] || ".txt";

  return html`<article
    class="search-accordion code-accordion border rounded-3 my-3 min-w-0"
    classList=${() => ({ "is-open": props.isOpen(), "shadow-sm bg-light": props.isOpen() })}
  >
    ${ToolHeader({
      icon: html`<${CodeXml} size="16" class="text-body-tertiary" />`,
      title: "Writing code…",
      right: html`
        <small class="text-body-tertiary text-uppercase">${props.message?.input?.language}</small>
        <div class="btn-group btn-group-sm" role="group">
          ${props.message?.input?.source.length > 0
            ? html`
                <button
                  type="button"
                  class="btn btn-unstyled text-body-tertiary"
                  title="Download"
                  onClick=${() => downloadText("code" + ext, props.message?.toolUse?.input?.source)}
                >
                  <${Download} size="16" />
                </button>
              `
            : ""}
        </div>
      `,
      isOpen: props.isOpen,
      onToggle: props.onToggle,
      bodyId: props.bodyId,
    })}

    <div
      id=${props.bodyId}
      class="search-accordion__body"
      classList=${() => ({ show: props.isOpen() })}
    >
      <div class="mask-fade-bottom">
        <div class="overflow-auto pe-1 search-accordion__scroll">
          <div class="p-2">
            <${Show}
              when=${() =>
                props.message.toolUse?.input?.language === "html" &&
                getToolResult(props.message.toolUse, props.messages)?.html}
            >
              <div class="mb-2">
                <iframe
                  class="border rounded-2 w-100"
                  style=${() => `height:220px`}
                  srcdoc=${() => props.message.toolUse?.input?.source || ""}
                ></iframe>
              </div>
            <//>

            <pre class="code-block font-monospace mb-0"><code class="d-block">${() =>
              props.message.toolUse?.input?.source || ""}</code></pre>

            <${Show}
              when=${() =>
                (getToolResult(props.message.toolUse, props.messages)?.logs?.length ?? 0) > 0}
            >
              <div class="mt-3">
                <div class="text-body-tertiary mb-1 small">Logs</div>
                <pre class="code-block font-monospace mb-0">
                  ${() =>
                    (getToolResult(props.message.toolUse, props.messages)?.logs || []).join("\n")}
                </pre
                >
              </div>
            <//>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}
