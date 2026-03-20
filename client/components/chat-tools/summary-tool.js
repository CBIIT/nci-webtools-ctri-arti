import { FileText } from "lucide-solid";
import { marked } from "marked";
import { createEffect } from "solid-js";
import html from "solid-js/html";

import ToolHeader from "./tool-header.js";

const CONVERSATION_SUMMARY_TOKEN = "[Conversation Summary]";

function getSummaryBody(text = "") {
  const normalized = typeof text === "string" ? text.trimStart() : "";
  return normalized.startsWith(CONVERSATION_SUMMARY_TOKEN)
    ? normalized.slice(CONVERSATION_SUMMARY_TOKEN.length).replace(/^\s+/, "")
    : normalized;
}

export default function SummaryTool(props) {
  const summaryBody = () => getSummaryBody(props.message?.text || "");
  let scrollEl;

  createEffect(() => {
    summaryBody();
    if (!props.isOpen() || !scrollEl) return;
    requestAnimationFrame(() => {
      scrollEl.scrollTop = scrollEl.scrollHeight;
    });
  });

  return html`<article
    class="search-accordion border rounded-3 my-3 min-w-0"
    data-chat-message="true"
    data-role=${() => props.role || ""}
    data-summary-message="true"
    data-summary-open=${() => String(props.isOpen())}
    classList=${() => ({ "is-open": props.isOpen(), "shadow-sm bg-light": props.isOpen() })}
  >
    ${ToolHeader({
      icon: html`<${FileText} size="16" class="text-muted-contrast" />`,
      title: "Conversation Summary",
      right: () =>
        html`<small class="text-muted-contrast">${props.isOpen() ? "Open" : "Collapsed"}</small>`,
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
          <div
            ref=${(el) => {
              scrollEl = el;
            }}
            class="overflow-auto pe-1 search-accordion__scroll"
          >
            <div
              class="markdown p-2 min-w-0"
              innerHTML=${() =>
                marked
                  .parse(summaryBody() || "Streaming summary...")
                  ?.replace(/<metadata[\s\S]*?<\/metadata>/gi, "")}
            ></div>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}
