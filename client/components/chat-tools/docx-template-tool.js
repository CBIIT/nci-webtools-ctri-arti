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

  const isDiscovery = () => !input().replacements;
  const docxUrl = () => input().docxUrl || "";
  const filename = () => docxUrl().split("/").pop() || "document.docx";

  // Collapsible replacements state
  const [showReplacements, setShowReplacements] = createSignal(false);
  const replacementsData = () => JSON.stringify(input().replacements, null, 2);
  const replacementsCount = () => Object.keys(input().replacements || {}).length;

  // Download handler
  const handleDownload = async () => {
    const name = filename().replace(/\.docx$/, "") + "_filled.docx";
    await downloadDocxTemplate({
      docxUrl: docxUrl(),
      replacements: input().replacements,
      filename: name,
    });
  };

  const title = () => {
    if (isDiscovery()) {
      return `Reading ${filename()}`;
    }
    return `Filling ${filename()}`;
  };

  const rightText = () => {
    const r = result();
    if (!r) return "loading...";
    if (isDiscovery()) {
      const textLength = r.text?.length || 0;
      return `${textLength} characters`;
    }
    return r.warnings?.length ? `${r.warnings.length} warnings` : "ready";
  };

  const documentText = () => {
    const r = result();
    return r?.text || "";
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
              <!-- Replace mode: show collapsible replacements and HTML preview -->
              <div class="mb-2">
                <button
                  type="button"
                  class="btn btn-sm btn-link text-muted-contrast p-0 text-decoration-none"
                  onClick=${(e) => setShowReplacements(!showReplacements())}
                >
                  ${() => (showReplacements() ? "▼" : "▶")} Replacements (${replacementsCount})
                </button>
                <${Show} when=${showReplacements}>
                  <pre
                    class="p-2 mt-1 m-0 small text-wrap bg-light rounded"
                    style="max-height: 200px; overflow: auto;"
                  >${replacementsData}</pre>
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
            <!-- Discovery mode: show document text content -->
            <pre class="p-2 m-0 small text-wrap bg-light rounded" style="max-height: 300px; overflow: auto;">${documentText}</pre>
          <//>
        </div>
      </div>
    </div>
  </article>`;
}
