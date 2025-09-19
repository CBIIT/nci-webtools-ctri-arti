import { For } from "solid-js";
import html from "solid-js/html";

import { Search } from "lucide-solid";

import { getSearchResults, getToolResult } from "../../utils/tools.js";

import ToolHeader from "./tool-header.js";

/**
 * Search Tool Component
 *
 * @param {*} props - The props for the component
 * @param props.message - The message object
 * @param props.messages - The messages array
 * @param props.isOpen - A signal indicating if the tool is open
 * @param props.onToggle - A function to toggle the tool's open state
 * @param props.results - The search results
 * @param props.bodyId - The ID for the tool's body element
 * @returns {JSX.Element}
 */
export default function SearchTool(props) {
  const results = () =>
    getSearchResults(getToolResult(props.message?.toolUse, props.messages)) || [];

  return html`<article
    class="search-accordion border rounded-3 my-3 min-w-0"
    classList=${() => ({ "is-open": props.isOpen(), "shadow-sm bg-light": props.isOpen() })}
  >
    ${ToolHeader({
      icon: html`<${Search} size="16" class="text-muted-contrast" />`,
      title: () => props.message?.toolUse?.input?.query || "Searching...",
      right: () => html`<small class="text-muted-contrast"> ${results().length} results</small>`,
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
            <div class="list-group list-group-flush">
              <${For}
                each=${() =>
                  getSearchResults(getToolResult(props.message?.toolUse, props.messages))}
              >
                ${(result) => {
                  const hostname = new URL(result.url).hostname;
                  const favicon = `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;

                  return html`
                    <a
                      class="list-group-item list-group-item-action d-flex align-items-center gap-3 py-1 px-2 border-0"
                      href=${result?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span
                        class="d-inline-flex align-items-center justify-content-center flex-shrink-0"
                        style="width:16px;height:16px;"
                      >
                        <img src=${favicon} width="16" height="16" alt="" aria-hidden="true" />
                      </span>

                      <div class="d-flex flex-row align-items-center gap-2 min-w-0 w-100">
                        <span class="text-truncate small text-body-emphasis">${result?.title}</span>
                        <small class="text-muted-contrast flex-shrink-0">${hostname}</small>
                      </div>
                    </a>
                  `;
                }}
              <//>
            </div>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}
