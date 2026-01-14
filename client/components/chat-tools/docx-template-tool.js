import { Show, For } from "solid-js";
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

  const replacementsCount = () => Object.keys(input().replacements || {}).length;
  const replacementsList = () => {
    const replacements = input().replacements || {};
    return Object.entries(replacements).map(([find, replace]) => ({
      find,
      replace: Array.isArray(replace) ? replace.join(", ") : replace,
    }));
  };

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
      const blockCount = r.blocks?.length || 0;
      return `${blockCount} blocks`;
    }
    return r.warnings?.length ? `${r.warnings.length} warnings` : "ready";
  };

  const documentBlocks = () => {
    const r = result();
    return r?.blocks || [];
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
              <details class="mb-2 small">
                <summary class="text-muted-contrast" style="cursor: pointer;">
                  Replacements (${replacementsCount})
                </summary>
                <div class="mt-1 ps-3" style="max-height: 200px; overflow: auto;">
                  <${For} each=${replacementsList}>
                    ${(item) => html`
                      <div class="py-1 border-bottom">
                        <code class="text-danger">${item.find}</code>
                        <span class="mx-1">\u2192</span>
                        <span class="text-success">${item.replace}</span>
                      </div>
                    `}
                  <//>
                </div>
              </details>
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
            <!-- Discovery mode: show document blocks with metadata -->
            <div class="small" style="max-height: 300px; overflow: auto;">
              <${For} each=${documentBlocks}>
                ${(block) => html`
                  <div class="p-2 border-bottom d-flex gap-2 align-items-start">
                    <span class="badge bg-secondary font-monospace" title="Block index">@${block.index}</span>
                    <span class="badge ${block.type === 'cell' ? 'bg-info' : 'bg-primary'}" title="Block type">
                      ${block.type === 'cell' ? `${block.type} [${block.row},${block.col}]` : block.type}
                    </span>
                    <span class="badge bg-warning text-dark" title="Style">${block.style}</span>
                    <span class="text-break flex-grow-1" style="word-break: break-word;">
                      ${block.text || html`<em class="text-muted">(empty)</em>`}
                    </span>
                  </div>
                `}
              <//>
            </div>
          <//>
        </div>
      </div>
    </div>
  </article>`;
}
