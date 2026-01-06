import { createSignal, Show } from "solid-js";
import html from "solid-js/html";

import { Download, FileText } from "lucide-solid";

import { downloadDocxTemplate, getToolResult } from "../../utils/tools.js";

import ToolHeader from "./tool-header.js";
import Tooltip from "../tooltip.js";

/**
 * DocxTemplate Tool Component - displays DOCX template processing results
 *
 * @param {*} props - The props for the component
 * @param props.message - The message object
 * @param props.messages - The messages array
 * @param props.isOpen - A signal indicating if the tool is open
 * @param props.onToggle - A function to toggle the tool's open state
 * @param props.bodyId - The ID for the tool's body element
 * @returns {JSX.Element}
 */
export default function DocxTemplateTool(props) {
  const input = () => props.message?.toolUse?.input || {};
  const result = () => getToolResult(props.message?.toolUse, props.messages);

  const isDiscovery = () => !input().data;
  const docxUrl = () => input().docxUrl || "";
  const filename = () => docxUrl().split("/").pop() || "template.docx";

  // Collapsible variables state
  const [showVariables, setShowVariables] = createSignal(false);
  const variablesData = () => JSON.stringify(input().data, null, 2);
  const variablesCount = () => Object.keys(input().data || {}).length;

  // Download handler
  const handleDownload = async () => {
    const name = filename().replace(/\.docx$/, "") + "_generated.docx";
    await downloadDocxTemplate({
      docxUrl: docxUrl(),
      data: input().data,
      filename: name,
    });
  };

  const title = () => {
    if (isDiscovery()) {
      return `Discovering variables in ${filename()}`;
    }
    return `Generating document from ${filename()}`;
  };

  const rightText = () => {
    const r = result();
    if (!r) return "loading...";
    if (isDiscovery()) {
      const vars = r.variables || {};
      return `${Object.keys(vars).length} variables`;
    }
    return r.warnings?.length ? `${r.warnings.length} warnings` : "ready";
  };

  const variablesJson = () => {
    const r = result();
    if (!r?.variables) return "";
    return JSON.stringify(r.variables, null, 2);
  };

  return html`<article
    class="search-accordion border rounded-3 my-3 min-w-0"
    classList=${() => ({ "is-open": props.isOpen(), "shadow-sm bg-light": props.isOpen() })}
  >
    ${ToolHeader({
      icon: html`<${FileText} size="16" class="text-muted-contrast" />`,
      title,
      right: () => html`
        <div class="d-flex align-items-center gap-2">
          <small class="text-muted-contrast">${rightText}</small>
          <${Show} when=${() => !isDiscovery() && result()?.html}>
            <${Tooltip}
              title="Download Word document"
              placement="top"
              arrow=${true}
              class="text-white bg-primary"
            >
              <button
                type="button"
                class="btn btn-unstyled tool-btn-icon text-muted-contrast"
                title="Download"
                onClick=${handleDownload}
              >
                <${Download} size="16" />
              </button>
            <//>
          <//>
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
          <${Show}
            when=${isDiscovery}
            fallback=${() => html`
              <!-- Generation mode: show collapsible variables and HTML preview -->
              <div class="mb-2">
                <button
                  type="button"
                  class="btn btn-sm btn-link text-muted-contrast p-0 text-decoration-none"
                  onClick=${() => setShowVariables(!showVariables())}
                >
                  ${() => (showVariables() ? "▼" : "▶")} Variables used (${variablesCount})
                </button>
                <${Show} when=${showVariables}>
                  <pre
                    class="p-2 mt-1 m-0 small text-wrap bg-light rounded"
                    style="max-height: 200px; overflow: auto;"
                  >${variablesData}</pre>
                <//>
              </div>
              <${Show} when=${() => result()?.html}>
                <div class="ratio ratio-16x9 border rounded-2 mb-2">
                  <iframe
                    title="Document Preview"
                    class="border-0 w-100 h-100 bg-white"
                    srcdoc=${() => result()?.html || ""}
                  ></iframe>
                </div>
              <//>
              <${Show} when=${() => result()?.warnings?.length > 0}>
                <div class="small text-warning mt-2">
                  <strong>Warnings:</strong>
                  <ul class="mb-0 ps-3">
                    ${() => result()?.warnings?.map((w) => html`<li>${w}</li>`)}
                  </ul>
                </div>
              <//>
            `}
          >
            <!-- Discovery mode: show variables schema -->
            <pre class="p-2 m-0 small text-wrap bg-light rounded" style="max-height: 300px; overflow: auto;">${variablesJson}</pre>
          <//>
        </div>
      </div>
    </div>
  </article>`;
}
