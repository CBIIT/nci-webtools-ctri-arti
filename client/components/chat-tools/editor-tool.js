import { Show } from "solid-js";
import html from "solid-js/html";

import { Download, File } from "lucide-solid";
import { parse } from "marked";

import { downloadText } from "../../utils/files.js";
import { getToolResult } from "../../utils/tools.js";
import Tooltip from "../tooltip.js";

import ToolHeader from "./tool-header.js";

export default function EditorTool(props) {
  const getFilename = () => props.message?.toolUse?.input?.path || "untitled.txt";
  const contents = () =>
    localStorage.getItem(`file:${getFilename()}`) ||
    props.message?.toolUse?.input?.file_text ||
    props.message?.toolUse?.input?.new_str ||
    "";
  const title = () =>
    ({
      view: "Viewing",
      str_replace: "Updating",
      create: "Creating",
      insert: "Updating",
      undo_edit: "Undoing Edit",
    })[props.message?.toolUse?.input?.command] || "Editing";

  const rendered = () => {
    const markdown = getToolResult(props.message?.toolUse, props.messages);
    if (!markdown || typeof markdown !== "string") {
      return "";
    }

    return parse(markdown);
  };

  return html`<article
    class="search-accordion editor-accordion border rounded-3 my-3 min-w-0"
    classList=${() => ({ "is-open": props.isOpen(), "shadow-sm bg-light": props.isOpen() })}
  >
    ${ToolHeader({
      icon: html`<${File} size="16" class="text-muted-contrast" />`,
      title: html` ${title}
        <small class="text-muted-contrast ms-2 text-truncate d-none d-sm-inline">
          File: ${() => getFilename() || "untitled"}
        </small>`,
      right: html`
        <div class="btn-group btn-group-sm" role="group">
          <${Show} when=${() => typeof contents() === "string" && contents().length > 0}>
            <${Tooltip}
              title="Download file"
              placement="top"
              arrow=${true}
              class="text-white bg-primary"
            >
              <button
                type="button"
                class="btn btn-unstyled tool-btn-icon text-muted-contrast"
                title="Download"
                onClick=${() => downloadText(getFilename() || "file.txt", contents() || "")}
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
        <div class="mask-fade-bottom">
          <div class="overflow-auto pe-1 search-accordion__scroll">
            <div class="p-2">
              <div class="mb-3">
                <div class="text-muted-contrast mb-1 small">Contents</div>
                <pre
                  class="content-block font-monospace mb-0"
                ><code class="d-block">${contents}</code></pre>
              </div>
              <${Show} when=${() => !!rendered()}>
                <div class="mt-3">
                  <div class="text-muted-contrast mb-1 small">Rendered</div>
                  <div class="content-render border rounded-2 p-2">
                    <div class="prose" innerHTML=${rendered} />
                  </div>
                </div>
              <//>
            </div>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}
