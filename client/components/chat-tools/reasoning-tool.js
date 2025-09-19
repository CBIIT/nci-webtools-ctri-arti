import { Show } from "solid-js";
import html from "solid-js/html";

import { Brain } from "lucide-solid";
import { stringify } from "yaml";

import { getToolResult } from "../../utils/tools.js";

import ToolHeader from "./tool-header.js";

export default function ReasoningTool(props) {
  return html`<article
    class="search-accordion reasoning-accordion border rounded-3 my-3 min-w-0"
    classList=${() => ({ "is-open": props.isOpen(), "shadow-sm bg-light": props.isOpen() })}
  >
    ${ToolHeader({
      icon: html` <${Brain} size="16" class="text-muted-contrast" />`,
      title:
        props.message?.reasoningContent || props.message?.toolUse?.name === "think"
          ? "Reasoning…"
          : props.message?.toolUse?.name || "Internal",
      right: html`<small class="text-muted-contrast text-capitalize">
        ${() => props.message?.toolUse?.name || "internal"}
      </small>`,
      isOpen: props.isOpen,
      onToggle: props.onToggle,
      bodyId: props.bodyId,
    })}

    <div
      id=${props.bodyId}
      class="search-accordion__body"
      classList=${() => ({ show: props.isOpen() })}
    >
      <div class="mask-fade-bottom">
        <div class="overflow-auto pe-1 search-accordion__scroll">
          <div class="p-2 small">
            <${Show} when=${() => props.message?.reasoningContent?.reasoningText?.text}>
              <pre class="mb-2 reasoning-pre text-prewrap font-monospace">
                ${() => props.message?.reasoningContent.reasoningText.text}
              </pre
              >
            <//>

            <${Show} when=${() => props.message?.toolUse}>
              <div class="mt-2">
                <div class="text-muted-contrast mb-1">Input</div>
                <pre class="reasoning-pre font-monospace mb-2">
                  ${() => stringify(props.message?.toolUse?.input)}
                </pre
                >

                <div class="text-muted-contrast mb-1">Result</div>
                <pre class="reasoning-pre font-monospace mb-0">
                  ${() => stringify(getToolResult(props.message?.toolUse, props.messages))}
                </pre
                >
              </div>
            <//>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}
