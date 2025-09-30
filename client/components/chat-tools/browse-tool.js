import html from "solid-js/html";

import { Globe } from "lucide-solid";
import { parse } from "marked";

import { getToolResult } from "../../utils/tools.js";

import ToolHeader from "./tool-header.js";

/**
 * Browse Tool Component
 *
 * @param {*} props - The props for the component
 * @param props.message - The message object
 * @param props.messages - The messages array
 * @param props.isOpen - A signal indicating if the tool is open
 * @param props.onToggle - A function to toggle the tool's open state
 * @param props.bodyId - The ID for the tool's body element
 * @returns {JSX.Element}
 */
export default function BrowseTool(props) {
  return html`<article
    class="search-accordion browse-accordion border rounded-3 my-3 min-w-0"
    classList=${() => ({ "is-open": props.isOpen(), "shadow-sm bg-light": props.isOpen() })}
  >
    ${ToolHeader({
      icon: html`<${Globe} size="16" class="text-muted-contrast" />`,
      title: () =>
        (props.message?.toolUse?.input?.url || []).map((u) => new URL(u).hostname).join(", ") ||
        "Browsing...",
      right: () =>
        html`<small class="text-muted-contrast">
          ${props.message?.toolUse?.input?.url?.length || 0} sources
        </small>`,
      isOpen: props.isOpen,
      onToggle: () => props.onToggle(props.bodyId),
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
            <div class="p-2">
              <div class="text-muted-contrast mb-2 small fw-semibold">
                ${() => props.message?.toolUse?.input?.topic || ""}
              </div>
              <div
                class="markdown"
                innerHTML=${() =>
                  parse(getToolResult(props.message?.toolUse, props.messages) || "")}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}
