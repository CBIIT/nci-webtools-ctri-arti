import { Show } from "solid-js";
import html from "solid-js/html";

import { Brain } from "lucide-solid";
import { stringify } from "yaml";

import { getToolResult } from "../../utils/tools.js";

import ToolHeader from "./tool-header.js";

export default function ReasoningTool(props) {
  const headerTitle = () =>
    props.message?.reasoningContent || props.message?.toolUse?.name === "think"
      ? "Reasoning…"
      : props.message?.toolUse?.name || "Internal";

  const toolName = () => props.message?.toolUse?.name || "internal";
  const reasonText = () => props.message?.reasoningContent?.reasoningText?.text;

  const rawInput = () => props.message?.toolUse?.input;
  const rawResult = () => getToolResult(props.message?.toolUse, props.messages);

  const isEmpty = (v) => {
    if (v == null) {
      return true;
    }
    if (typeof v === "string") {
      return v.trim() === "";
    }
    if (Array.isArray(v)) {
      return v.length === 0;
    }
    if (typeof v === "object") {
      return Object.keys(v).length === 0;
    }
    return false;
  };

  const showInput = () => !isEmpty(rawInput());
  const showResult = () => !isEmpty(rawResult());

  const inputStr = () => (showInput() ? stringify(rawInput()) : "");
  const resultStr = () => (showResult() ? stringify(rawResult()) : "");

  return html`<article
    class="search-accordion reasoning-accordion border rounded-3 my-3 min-w-0"
    classList=${() => ({ "is-open": props.isOpen(), "shadow-sm bg-light": props.isOpen() })}
  >
    ${ToolHeader({
      icon: html` <${Brain} size="16" class="text-muted-contrast" />`,
      title: headerTitle,
      right: () => html`<small class="text-muted-contrast text-capitalize"> ${toolName()}</small>`,
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
            <div class="p-2 small">
              <${Show} when=${reasonText}>
                <pre class="mb-2 reasoning-pre text-prewrap font-monospace">${reasonText}</pre>
              <//>

              <${Show} when=${() => showInput() || showResult()}>
                <div class="mt-2">
                  <div class="text-muted-contrast mb-1">Input</div>
                  <pre class="reasoning-pre font-monospace mb-2">${inputStr}</pre>

                  <div class="text-muted-contrast mb-1">Result</div>
                  <pre class="reasoning-pre font-monospace mb-0">${resultStr}</pre>
                </div>
              <//>
            </div>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}
