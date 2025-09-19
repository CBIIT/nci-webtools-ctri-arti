import { createMemo, createSignal, Show } from "solid-js";
import html from "solid-js/html";

import { CodeXml, Download, Eye, EyeOff } from "lucide-solid";

import { downloadText } from "../../utils/files.js";
import { getToolResult } from "../../utils/tools.js";
import Tooltip from "../tooltip.js";

import ToolHeader from "./tool-header.js";

export default function CodeTool(props) {
  const lang = () => props.message?.toolUse?.input?.language || "";
  const source = () => props.message?.toolUse?.input?.source || "";
  const results = () => getToolResult(props.message.toolUse, props.messages) || {};

  const hasPreview = createMemo(
    () => lang() === "html" && !!results()?.html && source().length > 0
  );
  const [showPreview, setShowPreview] = createSignal(hasPreview());

  const ext = () =>
    ({
      javascript: ".js",
      typescript: ".ts",
      html: ".html",
      css: ".css",
      json: ".json",
    })[lang()] || ".txt";

  function togglePreview(e) {
    e?.stopPropagation();
    if (!hasPreview()) {
      return;
    }

    setShowPreview((v) => !v);
  }

  return html`<article
    class="search-accordion code-accordion border rounded-3 my-3 min-w-0"
    classList=${() => ({ "is-open": props.isOpen(), "shadow-sm bg-light": props.isOpen() })}
  >
    ${ToolHeader({
      icon: html`<${CodeXml} size="16" class="text-muted-contrast" />`,
      title: () => "Writing code…",
      right: () => html`
        <div class="d-inline-flex align-items-center gap-2" onClick=${(e) => e.stopPropagation()}>
          <small class="text-muted-contrast text-uppercase me-1">${lang() || "text"}</small>

          ${hasPreview()
            ? html`
                <${Tooltip}
                  title=${() => (showPreview() ? "Show code" : "Show preview")}
                  placement="top"
                  arrow=${true}
                  class="text-white bg-primary"
                >
                  <button
                    type="button"
                    class="btn btn-unstyled text-muted-contrast btn-sm"
                    aria-pressed=${showPreview()}
                    title=${() => (showPreview() ? "Show code" : "Show preview")}
                    onClick=${togglePreview}
                  >
                    ${() =>
                      showPreview() ? html`<${Eye} size="16" />` : html`<${EyeOff} size="16" />`}
                  </button>
                <//>
              `
            : ""}
          ${() =>
            source().length > 0
              ? html`
                  <${Tooltip}
                    title="Download code"
                    placement="top"
                    arrow=${true}
                    class="text-white bg-primary"
                  >
                    <button
                      type="button"
                      class="btn btn-unstyled text-muted-contrast btn-sm tool-btn-icon ms-1"
                      title="Download"
                      onClick=${(e) => {
                        e.stopPropagation();
                        downloadText("code" + ext, source());
                      }}
                    >
                      <${Download} size="16" />
                    </button>
                  <//>
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
      <div class="accordion-inner">
        <div class="p-2">
          <${Show} when=${() => hasPreview() && showPreview()}>
            <div class="mb-2">
              <div class="ratio ratio-16x9 border rounded-2">
                <iframe
                  title="Preview"
                  class="border-0 w-100 h-100"
                  srcdoc=${() => source()}
                ></iframe>
              </div>
            </div>
          <//>

          <${Show} when=${() => !showPreview() || !hasPreview()}>
            <pre class="code-block font-monospace mb-0">
            <code class="d-block">${() => source()}</code>
          </pre>

            <${Show} when=${() => (results()?.logs?.length ?? 0) > 0}>
              <div class="mt-3">
                <div class="text-muted-contrast mb-1 small">Logs</div>
                <pre class="code-block font-monospace mb-0">
                ${() => (results()?.logs || []).join("\n")}
              </pre>
              </div>
            <//>
          <//>
        </div>
      </div>
    </div>
  </article>`;
}
