import { For, Show } from "solid-js";
import html from "solid-js/html";

import { Database } from "lucide-solid";

import { getToolResult } from "../../utils/tools.js";

import ToolHeader from "./tool-header.js";

/**
 * Data Tool Component - displays S3 bucket file access results
 *
 * @param {*} props - The props for the component
 * @param props.message - The message object
 * @param props.messages - The messages array
 * @param props.isOpen - A signal indicating if the tool is open
 * @param props.onToggle - A function to toggle the tool's open state
 * @param props.bodyId - The ID for the tool's body element
 * @returns {JSX.Element}
 */
export default function DataTool(props) {
  const input = () => props.message?.toolUse?.input || {};
  const result = () => getToolResult(props.message?.toolUse, props.messages);

  const isListing = () => {
    const key = input().key;
    return !key || key.endsWith("/");
  };

  const fileCount = () => {
    const r = result();
    return Array.isArray(r) ? r.length : 0;
  };

  const title = () => {
    const { bucket, key } = input();
    if (!key) return `Listing ${bucket}`;
    return key;
  };

  const rightText = () => {
    if (isListing()) {
      return `${fileCount()} files`;
    }
    const r = result();
    if (typeof r === "string") {
      return `${r.length} chars`;
    }
    return "loaded";
  };

  const contentPreview = () => {
    const r = result();
    if (typeof r === "string") return r.slice(0, 5000);
    if (r) return JSON.stringify(r, null, 2).slice(0, 5000);
    return "Loading...";
  };

  return html`<article
    class="search-accordion border rounded-3 my-3 min-w-0"
    classList=${() => ({ "is-open": props.isOpen(), "shadow-sm bg-light": props.isOpen() })}
  >
    ${ToolHeader({
      icon: html`<${Database} size="16" class="text-muted-contrast" />`,
      title,
      right: () => html`<small class="text-muted-contrast">${rightText}</small>`,
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
        <div class="mask-fade-bottom">
          <div class="overflow-auto pe-1 search-accordion__scroll">
            <${Show}
              when=${isListing}
              fallback=${() => html`
                <pre class="p-2 m-0 small text-wrap" style="max-height: 300px; overflow: auto;">${contentPreview}</pre>
              `}
            >
              <div class="list-group list-group-flush">
                <${For} each=${result}>
                  ${(file) => html`
                    <div class="list-group-item d-flex align-items-center gap-2 py-1 px-2 border-0 small">
                      <span class="text-muted">📄</span>
                      <span class="text-truncate">${file}</span>
                    </div>
                  `}
                <//>
              </div>
            <//>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}
