import { createSignal, For, onCleanup, Show } from "solid-js";
import html from "solid-js/html";

import { Check, Copy, Download, ThumbsDown, ThumbsUp, X } from "lucide-solid";
import { parse } from "marked";
import { stringify } from "yaml";

import Tooltip from "../../../components/tooltip.js";
import { downloadCsv, downloadText } from "../../../utils/files.js";
import { getMarked } from "../../../utils/utils.js";

const marked = getMarked();

export default function Message(p) {
  const [dialog, setDialog] = createSignal(null);
  const [visible, setVisible] = createSignal({});
  const [copied, setCopied] = createSignal(false);
  const toggleVisible = (key) => setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  const getToolResult = (toolUse) =>
    p.messages?.find((m) => m.content?.find((c) => c?.toolResult?.toolUseId === toolUse?.toolUseId))
      ?.content[0].toolResult?.content[0]?.json?.results;
  const getSearchResults = (results) => results?.web && [...results.web, ...results.news];
  let resetTimer;

  function openFeedback(feedback, comment) {
    let d = dialog();
    let f = d.querySelector("form");
    f.feedback.value = feedback ? "Positive Feedback" : "Negative Feedback";
    f.comment.value = comment || "";
    d.showModal();
  }

  async function submitFeedback(e) {
    e.preventDefault();
    e.stopPropagation();
    await dialog()?.close();
    let feedback = e.target.feedback.value;
    let comment = e.target.comment.value;
    await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        feedback: [
          feedback,
          "\ncomment:",
          comment,
          "\noriginal message:",
          p.message.content?.[0]?.text,
        ]
          .filter(Boolean)
          .join("\n"),
        context: p.messages,
      }),
    }).then((e) => e.json());
  }

  async function handleCopy(text) {
    const RESET_MS = 2500;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => setCopied(false), RESET_MS);
    } catch (err) {
      console.error("Error copying text: ", err);
    }
  }

  onCleanup(() => clearInterval(resetTimer));

  return html` <dialog
      ref=${(el) => setDialog(el)}
      class="z-3 border-0 rounded-3 shadow-lg p-0 bg-white"
      style="width: min(520px, calc(100vw - 2rem));"
      aria-labelledby=${`fb-title-${p.index}`}
    >
      <form onSubmit=${submitFeedback} class="d-flex flex-column">
        <div class="d-flex align-items-center justify-content-between p-4">
          <h2 id=${`fb-title-${p.index}`} class="h5 fw-semibold mb-0">Submit Feedback</h2>
          <button
            type="reset"
            class="close-btn btn btn-sm d-inline-flex align-items-center justify-content-center rounded"
            aria-label="Close"
            onClick=${() => dialog()?.close()}
          >
            <${X} size="18" />
          </button>
        </div>

        <div class="pb-3 px-4 d-grid gap-3">
          <div>
            <span id=${`thumbs-label-${p.index}`} class="visually-hidden">Feedback sentiment</span>
            <div class="d-flex gap-2" role="group" aria-labelledby=${`thumbs-label-${p.index}`}>
              <input
                class="btn-check"
                type="radio"
                name="feedback"
                id=${`feedback-positive-${p.index}`}
                value="Positive Feedback"
                autocomplete="off"
              />
              <label
                class="btn btn-light btn-outline-success d-inline-flex align-items-center gap-2 rounded-2 p-2"
                for=${`feedback-positive-${p.index}`}
                title="Thumbs up"
              >
                <${ThumbsUp} size="18" />
                <span>Positive</span>
              </label>

              <input
                class="btn-check"
                type="radio"
                name="feedback"
                id=${`feedback-negative-${p.index}`}
                value="Negative Feedback"
                autocomplete="off"
              />
              <label
                class="btn btn-outline-danger d-inline-flex align-items-center gap-2 rounded-2 p-2"
                for=${`feedback-negative-${p.index}`}
                title="Thumbs down"
              >
                <${ThumbsDown} size="18" />
                <span>Negative</span>
              </label>
            </div>
          </div>

          <div class="mt-2">
            <textarea
              id=${`feedback-comment-${p.index}`}
              name="comment"
              placeholder="Comment..."
              rows="4"
              class="form-control"
            />
          </div>
        </div>

        <div class="d-flex justify-content-end gap-2 p-4">
          <button type="reset" class="btn btn-light border" onClick=${() => dialog()?.close()}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">Submit</button>
        </div>
      </form>
    </dialog>

    <${For} each=${p.message?.content}>
      ${(c) => {
        if (c.text !== undefined) {
          // include empty text to start message
          return html`
            <div
              class="position-relative hover-visible-parent"
              classList=${{ "text-end": p.message.role === "user" }}
            >
              <div
                class="p-2 markdown"
                classList=${{
                  "d-inline-block p-3 bg-secondary-subtle rounded my-2": p.message.role === "user",
                }}
                innerHTML=${() =>
                  marked.parse(c.text || "")?.replace(/<metadata[\s\S]*?<\/metadata>/gi, "")}
              ></div>

              <!-- Show feedback only for last message from model -->
              <${Show}
                when=${() => p.message?.role !== "user" && p.index === p.messages.length - 1}
              >
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
                      onClick=${() => openFeedback(true)}
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
                      onClick=${() => openFeedback(false)}
                    >
                      <${ThumbsDown} size="16" color="black" />
                    </button>
                  <//>
                  <${Tooltip}
                    title=${() => (copied() ? "Copied!" : "Copy response to clipboard")}
                    placement="top"
                    arrow=${true}
                    class="text-white bg-primary"
                  >
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-light border-0"
                      aria-label=${() => (copied() ? "Copied!" : "Copy response to clipboard")}
                      aria-live="polite"
                      onClick=${() => handleCopy(c.text)}
                    >
                      <span class="copy-swap">
                        <span class=${() => (copied() ? "icon hide" : "icon show")}>
                          <${Copy} size="16" color="black" />
                        </span>
                        <span class=${() => (copied() ? "icon show" : "icon hide")}>
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
                          p.messages.map((m) => ({
                            role: m.role,
                            content: m.content
                              ?.map((c) => c.text)
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
        } else if (c.toolUse?.name === "search") {
          return html`<details
            class="w-100 overflow-auto p-2 rounded mvh-25"
            classList=${() => ({ "shadow-sm bg-light": visible()[p.index] })}
            open=${() => visible()[p.index]}
          >
            <summary
              class="fw-semibold px-1 mb-2"
              onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}
            >
              Searching: ${() => c.toolUse?.input?.query}...
            </summary>
            <div class="list-group">
              <${For} each=${() => getSearchResults(getToolResult(c.toolUse))}>
                ${(result) =>
                  html`<a
                    class="list-group-item list-group-item-action border-0"
                    href=${result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span>${result.title}</span>
                    <small class="ms-2 text-muted">${new URL(result.url).hostname}</small>
                    <ul class="small fw-normal">
                      <${For} each=${result.extra_snippets}>
                        ${(snippet) => html`<li>${snippet}</li>`}
                      <//>
                    </ul>
                  </a>`}
              <//>
            </div>
          </details>`;
        } else if (c.toolUse?.name === "browse") {
          return html`<details
            class="w-100 overflow-auto p-2 rounded mvh-25"
            classList=${() => ({ "shadow-sm bg-light": visible()[p.index] })}
            open=${() => visible()[p.index]}
          >
            <summary
              class="fw-semibold px-1 mb-2"
              onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}
            >
              Researching:
              ${() => c.toolUse?.input?.url?.map((e) => new URL(e).hostname).join(", ")}...
            </summary>
            <div class="fw-semibold mb-2 text-muted">${() => c.toolUse?.input?.topic}</div>
            <div class="markdown" innerHTML=${() => parse(getToolResult(c.toolUse) || "")} />
          </details>`;
        } else if (c.toolUse?.name === "code") {
          return html`<details
            class="w-100 overflow-auto p-2 rounded hover-visible-parent position-relative"
            classList=${() => ({ "shadow-sm bg-light": visible()[p.index] })}
            open=${() => visible()[p.index]}
          >
            <summary
              class="fw-semibold  px-1 mb-2"
              onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}
            >
              Writing Code...
            </summary>
            <${Show} when=${() => getToolResult(c.toolUse)?.html}>
              <iframe
                srcdoc=${() => c.toolUse?.input?.source}
                height=${() => getToolResult(c.toolUse)?.height + 20 || "auto"}
                class="border-0 w-100 mvh-100"
              ></iframe>
            <//>
            <div class="text-end end-0 top-0 opacity-50 position-absolute">
              <button
                class="btn btn-sm btn-outline-light border-0 hover-visible"
                onClick=${() =>
                  downloadText(
                    "code" +
                      ({
                        javascript: ".js",
                        html: ".html",
                      }[c.toolUse?.input?.language] || ".txt"),
                    c.toolUse?.input?.source
                  )}
              >
                💾
              </button>
            </div>
            <${Show} when=${() => getToolResult(c.toolUse)?.logs?.length}>
              <pre class="small mb-3 text-muted">${() => c.toolUse?.input?.source}</pre>
              <hr />
              <pre class="small mb-0">${() => getToolResult(c.toolUse)?.logs?.join?.("\n")}</pre>
            <//>
          </details>`;
        } else if (c.toolUse?.name === "editor") {
          const filename = () => c.toolUse?.input?.path || "untitled.txt";
          const contents = () =>
            localStorage.getItem(`file:${filename()}`) ||
            c.toolUse?.input?.file_text ||
            c.toolUse?.input?.new_str ||
            "";

          return html`<details
            class="w-100 overflow-auto p-2 rounded hover-visible-parent position-relative"
            classList=${() => ({ "shadow-sm": visible()[p.index] })}
            open=${() => true}
          >
            <summary
              class="fw-semibold px-1 mb-2"
              onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}
            >
              ${() =>
                ({
                  view: "Viewing",
                  str_replace: "Updating",
                  create: "Creating",
                  insert: "Updating",
                  undo_edit: "Undoing Edit",
                })[c.toolUse?.input?.command]}
              File: ${filename}
            </summary>
            <div class="text-end end-0 top-0 opacity-50 position-absolute">
              <button
                class="btn btn-sm btn-outline-light border-0 hover-visible"
                onClick=${() => downloadText(filename(), contents())}
              >
                💾
              </button>
            </div>
            <div class="text-prewrap">${contents}</div>
            <div
              class="text-prewrap"
              innerHTML=${() => parse(getToolResult(c.toolUse) || "")?.trim()}
            />
          </details>`;
        } else if (c.reasoningContent || c.toolUse) {
          return html`<details
            class="w-100 overflow-auto p-2 rounded mvh-25"
            classList=${() => ({ "shadow-sm bg-light": visible()[p.index] })}
            open=${() => visible()[p.index]}
          >
            <summary
              class="fw-semibold px-1 mb-2"
              onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}
            >
              ${() =>
                c.reasoningContent || c.toolUse?.name === "think"
                  ? "Reasoning..."
                  : c?.toolUse?.name}
            </summary>
            <div class="text-prewrap">
              <${Show} when=${() => c.reasoningContent?.reasoningText?.text}>
                ${() => c.reasoningContent.reasoningText.text}
              <//>
              <${Show} when=${() => c.toolUse}>
                ${() =>
                  html`${stringify(c?.toolUse?.input)} ${stringify(getToolResult(c.toolUse))}`}
              <//>
            </div>
          </details>`;
        }
      }}
    <//>`;
}
