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
  const inputStr = () => stringify(props.message?.toolUse?.input);
  const resultStr = () => stringify(getToolResult(props.message?.toolUse, props.messages));
  const reasonText = () => props.message?.reasoningContent?.reasoningText?.text;

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

              <${Show} when=${() => props.message?.toolUse}>
                <div class="mt-2">
                  <div class="text-muted-contrast mb-1">Input</div>
                  <pre class="reasoning-pre font-monospace mb-2">${inputStr || null}</pre>

                  <div class="text-muted-contrast mb-1">Result</div>
                  <pre class="reasoning-pre font-monospace mb-0">${resultStr || null}</pre>
                </div>
              <//>
            </div>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}
