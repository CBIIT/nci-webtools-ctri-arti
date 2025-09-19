import { Show } from "solid-js";
import html from "solid-js/html";

import { Check, Copy, Download, ThumbsDown, ThumbsUp } from "lucide-solid";
import { marked } from "marked";

import { downloadCsv } from "../../utils/files.js";
import Tooltip from "../tooltip.js";

/**
 * TextContent component
 *
 * Renders a message text block (markdown) and optional action buttons for copying,
 * feedback (thumbs up/down), and exporting the conversation as CSV. Designed to be
 * used inside the chat message renderer.
 *
 * @param {Object} props - Component props
 * @param {Object} props.message - Message object (should contain role and text)
 * @param {string} [props.text] - Optional text to render instead of message.text
 * @param {boolean} [props.isLast=false] - True when this message is the last model response (controls feedback visibility)
 * @param {Function} props.onCopy - Callback invoked when copy button is clicked; receives the text to copy
 * @param {Function} props.copied - Signal (getter) that returns true when text was recently copied
 * @param {Function} props.onFeedback - Callback invoked when feedback buttons are clicked; receives true for positive feedback
 * @param {Array} props.messages - Full conversation messages array (used when exporting CSV)
 * @returns {JSX.Element} Rendered TextContent element
 */
export default function TextContent(props) {
  return html`
    <div
      class="position-relative hover-visible-parent min-w-0"
      classList=${{ "text-end": props.message.role === "user" }}
    >
      <div
        class="p-2 markdown min-w-0"
        classList=${{
          "d-inline-block p-3 bg-secondary-subtle rounded my-2": props.message.role === "user",
        }}
        innerHTML=${() =>
          marked.parse(props.message?.text || "")?.replace(/<metadata[\s\S]*?<\/metadata>/gi, "")}
      ></div>

      <!-- Show feedback only for last message from model -->
      <${Show} when=${() => props.message?.role !== "user" && props.isLast}>
        <div>
          <${Tooltip}
            title="Mark as helpful"
            placement="top"
            arrow=${true}
            class="text-white bg-primary"
          >
            <button
              type="button"
              class="btn btn-sm btn-outline-light border-0"
              title="Mark as helpful"
              onClick=${() => props.onFeedback(true)}
            >
              <${ThumbsUp} size="16" color="black" />
            </button>
          <//>
          <${Tooltip}
            title="Mark as not helpful"
            placement="top"
            arrow=${true}
            class="text-white bg-primary"
          >
            <button
              type="button"
              class="btn btn-sm btn-outline-light border-0"
              title="Mark as not helpful"
              onClick=${() => props.onFeedback(false)}
            >
              <${ThumbsDown} size="16" color="black" />
            </button>
          <//>
          <${Tooltip}
            title=${() => (props.copied() ? "Copied!" : "Copy response to clipboard")}
            placement="top"
            arrow=${true}
            class="text-white bg-primary"
          >
            <button
              type="button"
              class="btn btn-sm btn-outline-light border-0"
              aria-label=${() => (props.copied() ? "Copied!" : "Copy response to clipboard")}
              aria-live="polite"
              onClick=${() => props.onCopy(props.message?.text)}
            >
              <span class="copy-swap">
                <span class=${() => (props.copied() ? "icon hide" : "icon show")}>
                  <${Copy} size="16" color="black" />
                </span>
                <span class=${() => (props.copied() ? "icon show" : "icon hide")}>
                  <${Check} size="16" color="black" />
                </span>
              </span>
            </button>
          <//>
          <${Tooltip}
            title="Export the entire conversation as CSV file"
            placement="top"
            arrow=${true}
            class="text-white bg-primary"
          >
            <button
              type="button"
              class="btn btn-sm btn-outline-light border-0"
              title="Export the entire conversation as CSV file"
              onClick=${() =>
                downloadCsv(
                  "conversation.csv",
                  props.messages.map((m) => ({
                    role: m.role,
                    content: m.content
                      ?.map((c) => c?.text)
                      .filter(Boolean)
                      .map((e) => e.trim())
                      .join("\n"),
                  }))
                )}
            >
              <${Download} size="16" color="black" />
            </button>
          <//>
        </div>
      <//>
    </div>
  `;
}
