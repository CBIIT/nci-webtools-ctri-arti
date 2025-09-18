import { createSignal, For, onCleanup, Show } from "solid-js";
import html from "solid-js/html";

import {
  Brain,
  Check,
  ChevronDown,
  CodeXml,
  Copy,
  Download,
  File,
  Globe,
  Search,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-solid";
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
      ?.content[0].toolResult?.content?.[0]?.json?.results;

  const getSearchResults = (results) =>
    results?.web ? [...(results.web || []), ...(results.news || [])] : [];

  let resetTimer;

  function openFeedback(feedback, comment) {
    const d = dialog();
    const f = d.querySelector("form");
    f.feedback.value = feedback ? "Positive Feedback" : "Negative Feedback";
    f.comment.value = comment || "";
    d.showModal();
  }

  async function submitFeedback(e) {
    e.preventDefault();
    e.stopPropagation();
    await dialog()?.close();
    const feedback = e.target.feedback.value;
    const comment = e.target.comment.value;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    }).then((r) => r.json());
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

  onCleanup(() => clearTimeout(resetTimer));

  const typeOfContent = (c) =>
    c?.toolUse?.name || (c?.reasoningContent ? "reason" : c?.text !== undefined ? "text" : "misc");

  const safeId = (s) => s.replace(/[^A-Za-z0-9_-]/g, "_");

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
      ${(c, i) => {
        const base = c?.toolUse?.toolUseId || `${p.index}-${i()}`;
        const type = typeOfContent(c);
        const key = `${type}:${base}`;
        const isOpen = () => !!visible()[key];
        const bodyId = `${type}-acc-body-${safeId(base)}`;

        if (c.text !== undefined) {
          return html`
            <div
              class="position-relative hover-visible-parent min-w-0"
              classList=${{ "text-end": p.message.role === "user" }}
            >
              <div
                class="p-2 markdown min-w-0"
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
          return html`<article
            class="search-accordion border rounded-3 my-3 min-w-0"
            classList=${() => ({ "is-open": isOpen(), "shadow-sm bg-light": isOpen() })}
          >
            <button
              type="button"
              class="search-accordion__toggle btn-reset w-100 d-flex flex-row align-items-center justify-content-between px-3 py-2 text-body-secondary rounded-3 min-w-0"
              aria-expanded=${isOpen}
              aria-controls=${bodyId}
              onClick=${() => toggleVisible(key)}
            >
              <div class="d-flex flex-row align-items-center gap-2 flex-grow-1 min-w-0">
                <span
                  class="d-inline-flex align-items-center justify-content-center"
                  style="width:20px;height:20px;"
                >
                  <${Search} size="16" class="text-body-tertiary" />
                </span>
                <span class="text-truncate fw-normal"> ${() => c.toolUse?.input?.query} </span>
              </div>

              <div class="d-flex flex-row align-items-center gap-2 flex-shrink-0 min-w-0">
                <small class="text-body-tertiary">
                  ${() => (getSearchResults(getToolResult(c.toolUse)) || []).length} results
                </small>
                <span class="chevron d-inline-flex">
                  <${ChevronDown} size="20" class="text-body-tertiary" />
                </span>
              </div>
            </button>

            <div
              id=${bodyId}
              class="search-accordion__body"
              classList=${() => ({ show: isOpen() })}
            >
              <div class="mask-fade-bottom">
                <div class="overflow-auto pe-1 search-accordion__scroll">
                  <div class="list-group list-group-flush">
                    <${For} each=${() => getSearchResults(getToolResult(c.toolUse))}>
                      ${(result) => {
                        const hostname = new URL(result.url).hostname;
                        const favicon = `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
                        return html`
                          <a
                            class="list-group-item list-group-item-action d-flex align-items-center gap-3 py-1 px-2 border-0"
                            href=${result.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <span
                              class="d-inline-flex align-items-center justify-content-center flex-shrink-0"
                              style="width:16px;height:16px;"
                            >
                              <img src=${favicon} width="16" height="16" alt="favicon" />
                            </span>

                            <div class="d-flex flex-row align-items-center gap-2 min-w-0 w-100">
                              <span class="text-truncate small text-body-emphasis"
                                >${result.title}</span
                              >
                              <small class="text-body-tertiary flex-shrink-0">${hostname}</small>
                            </div>
                          </a>
                        `;
                      }}
                    <//>
                  </div>
                </div>
              </div>
            </div>
          </article>`;
        } else if (c.toolUse?.name === "browse") {
          return html`<article
            class="search-accordion browse-accordion border rounded-3 my-3 min-w-0"
            classList=${() => ({ "is-open": isOpen(), "shadow-sm bg-light": isOpen() })}
          >
            <button
              type="button"
              class="search-accordion__toggle btn-reset w-100 d-flex flex-row align-items-center justify-content-between px-3 py-2 text-body-secondary rounded-3 min-w-0"
              aria-expanded=${isOpen}
              aria-controls=${bodyId}
              onClick=${() => toggleVisible(key)}
            >
              <div class="d-flex flex-row align-items-center gap-2 flex-grow-1 min-w-0">
                <span
                  class="d-inline-flex align-items-center justify-content-center"
                  style="width:20px;height:20px;"
                >
                  <${Globe} size="16" class="text-body-tertiary" />
                </span>
                <span class="text-truncate fw-normal">
                  Researching:
                  ${() =>
                    (c.toolUse?.input?.url || []).map((u) => new URL(u).hostname).join(", ") || "—"}
                </span>
              </div>

              <div class="d-flex flex-row align-items-center gap-2 flex-shrink-0 min-w-0">
                <small class="text-body-tertiary"
                  >${() => c.toolUse?.input?.url?.length || 0} sources</small
                >
                <span class="chevron d-inline-flex"
                  ><${ChevronDown} size="20" class="text-body-tertiary"
                /></span>
              </div>
            </button>

            <div
              id=${bodyId}
              class="search-accordion__body"
              classList=${() => ({ show: isOpen() })}
            >
              <div class="mask-fade-bottom">
                <div class="overflow-auto pe-1 search-accordion__scroll">
                  <div class="p-2">
                    <div class="text-body-tertiary mb-2 small fw-semibold">
                      ${() => c.toolUse?.input?.topic || ""}
                    </div>
                    <div
                      class="markdown"
                      innerHTML=${() => parse(getToolResult(c.toolUse) || "")}
                    />
                  </div>
                </div>
              </div>
            </div>
          </article>`;
        } else if (c.toolUse?.name === "code") {
          return html`<article
            class="search-accordion code-accordion border rounded-3 my-3 min-w-0"
            classList=${() => ({ "is-open": isOpen(), "shadow-sm bg-light": isOpen() })}
          >
            <button
              type="button"
              class="search-accordion__toggle btn-reset w-100 d-flex flex-row align-items-center justify-content-between px-3 py-2 text-body-secondary rounded-3 min-w-0"
              aria-expanded=${isOpen}
              aria-controls=${bodyId}
              onClick=${() => toggleVisible(key)}
            >
              <div class="d-flex flex-row align-items-center gap-2 flex-grow-1 min-w-0">
                <span
                  class="d-inline-flex align-items-center justify-content-center"
                  style="width:20px;height:20px;"
                >
                  <${CodeXml} size="16" class="text-body-tertiary" />
                </span>
                <span class="text-truncate fw-normal">Writing code…</span>
              </div>

              <div
                class="d-flex flex-row align-items-center gap-2 flex-shrink-0 min-w-0"
                onClick=${(e) => e.stopPropagation()}
              >
                <small class="text-body-tertiary text-uppercase"
                  >${() => c.toolUse?.input?.language || "text"}</small
                >
                <div class="btn-group btn-group-sm" role="group">
                  <${Show}
                    when=${() =>
                      typeof c?.toolUse?.input?.source === "string" &&
                      c?.toolUse?.input?.source.length > 0}
                  >
                    <button
                      type="button"
                      class="btn btn-unstyled text-body-tertiary"
                      title="Download"
                      onClick=${() => {
                        const lang = c?.toolUse?.input?.language || "";
                        const ext =
                          {
                            javascript: ".js",
                            typescript: ".ts",
                            html: ".html",
                            css: ".css",
                            json: ".json",
                          }[lang] || ".txt";
                        downloadText("code" + ext, c?.toolUse?.input?.source || "");
                      }}
                    >
                      <${Download} size="16" />
                    </button>
                  <//>
                </div>
                <span class="chevron d-inline-flex"
                  ><${ChevronDown} size="20" class="text-body-tertiary"
                /></span>
              </div>
            </button>

            <div
              id=${bodyId}
              class="search-accordion__body"
              classList=${() => ({ show: isOpen() })}
            >
              <div class="mask-fade-bottom">
                <div class="overflow-auto pe-1 search-accordion__scroll">
                  <div class="p-2">
                    <${Show}
                      when=${() =>
                        c.toolUse?.input?.language === "html" && getToolResult(c.toolUse)?.html}
                    >
                      <div class="mb-2">
                        <iframe
                          class="border rounded-2 w-100"
                          style=${() => `height:220px`}
                          srcdoc=${() => c.toolUse?.input?.source || ""}
                        ></iframe>
                      </div>
                    <//>

                    <pre class="code-block font-monospace mb-0"><code class="d-block">${() =>
                      c.toolUse?.input?.source || ""}</code></pre>

                    <${Show} when=${() => (getToolResult(c.toolUse)?.logs?.length ?? 0) > 0}>
                      <div class="mt-3">
                        <div class="text-body-tertiary mb-1 small">Logs</div>
                        <pre class="code-block font-monospace mb-0">
                          ${() => (getToolResult(c.toolUse)?.logs || []).join("\n")}</pre
                        >
                      </div>
                    <//>
                  </div>
                </div>
              </div>
            </div>
          </article>`;
        } else if (c.toolUse?.name === "editor") {
          const filename = () => c.toolUse?.input?.path || "untitled.txt";
          const contents = () =>
            localStorage.getItem(`file:${filename()}`) ||
            c.toolUse?.input?.file_text ||
            c.toolUse?.input?.new_str ||
            "";

          return html`<article
            class="search-accordion editor-accordion border rounded-3 my-3 min-w-0"
            classList=${() => ({ "is-open": isOpen(), "shadow-sm bg-light": isOpen() })}
          >
            <button
              type="button"
              class="search-accordion__toggle btn-reset w-100 d-flex flex-row align-items-center justify-content-between px-3 py-2 text-body-secondary rounded-3 min-w-0"
              aria-expanded=${isOpen}
              aria-controls=${bodyId}
              onClick=${() => toggleVisible(key)}
            >
              <div class="d-flex flex-row align-items-center gap-2 flex-grow-1 min-w-0">
                <span
                  class="d-inline-flex align-items-center justify-content-center"
                  style="width:20px;height:20px;"
                >
                  <${File} size="16" class="text-body-tertiary" />
                </span>
                <span class="text-truncate fw-normal">
                  ${() =>
                    ({
                      view: "Viewing",
                      str_replace: "Updating",
                      create: "Creating",
                      insert: "Updating",
                      undo_edit: "Undoing Edit",
                    })[c.toolUse?.input?.command] || "Editing"}
                </span>
                <small class="text-body-tertiary ms-2 text-truncate d-none d-sm-inline">
                  ${() => `File: ${filename?.() || filename || "untitled"}`}
                </small>
              </div>
              <div
                class="d-flex flex-row align-items-center gap-2 flex-shrink-0 min-w-0"
                onClick=${(e) => e.stopPropagation()}
              >
                <div class="btn-group btn-group-sm" role="group">
                  <${Show}
                    when=${() => typeof contents?.() === "string" && contents?.().length > 0}
                  >
                    <button
                      type="button"
                      class="btn btn-unstyled text-body-tertiary"
                      title="Download"
                      onClick=${() =>
                        downloadText(
                          filename?.() || filename || "file.txt",
                          contents?.() || contents || ""
                        )}
                    >
                      <${Download} size="16" />
                    </button>
                  <//>
                </div>
                <span class="chevron d-inline-flex"
                  ><${ChevronDown} size="20" class="text-body-tertiary"
                /></span>
              </div>
            </button>
            <div
              id=${bodyId}
              class="search-accordion__body"
              classList=${() => ({ show: isOpen() })}
            >
              <div class="mask-fade-bottom">
                <div class="overflow-auto pe-1 search-accordion__scroll">
                  <div class="p-2">
                    <div class="mb-3">
                      <div class="text-body-tertiary mb-1 small">Contents</div>
                      <pre class="content-block font-monospace mb-0"><code class="d-block">${() =>
                        contents?.() || contents || ""}</code></pre>
                    </div>
                    <${Show} when=${() => !!(getToolResult(c.toolUse) || "").trim()}>
                      <div class="mt-3">
                        <div class="text-body-tertiary mb-1 small">Rendered</div>
                        <div class="content-render border rounded-2 p-2">
                          <div
                            class="prose"
                            innerHTML=${() => (parse(getToolResult(c.toolUse) || "") || "").trim()}
                          />
                        </div>
                      </div>
                    <//>
                  </div>
                </div>
              </div>
            </div>
          </article>`;
        } else if (c.reasoningContent || c.toolUse) {
          return html`<article
            class="search-accordion reasoning-accordion border rounded-3 my-3 min-w-0"
            classList=${() => ({ "is-open": isOpen(), "shadow-sm bg-light": isOpen() })}
          >
            <button
              type="button"
              class="search-accordion__toggle btn-reset w-100 d-flex flex-row align-items-center justify-content-between px-3 py-2 text-body-secondary rounded-3 min-w-0"
              aria-expanded=${isOpen}
              aria-controls=${bodyId}
              onClick=${() => toggleVisible(key)}
            >
              <div class="d-flex flex-row align-items-center gap-2 flex-grow-1 min-w-0">
                <span
                  class="d-inline-flex align-items-center justify-content-center"
                  style="width:20px;height:20px;"
                >
                  <${Brain} size="16" class="text-body-tertiary" />
                </span>
                <span class="text-truncate fw-normal">
                  ${() =>
                    c.reasoningContent || c.toolUse?.name === "think"
                      ? "Reasoning…"
                      : c?.toolUse?.name || "Internal"}
                </span>
              </div>

              <div class="d-flex flex-row align-items-center gap-2 flex-shrink-0 min-w-0">
                <small class="text-body-tertiary text-capitalize"
                  >${() => c?.toolUse?.name || "internal"}</small
                >
                <span class="chevron d-inline-flex"
                  ><${ChevronDown} size="20" class="text-body-tertiary"
                /></span>
              </div>
            </button>

            <div
              id=${bodyId}
              class="search-accordion__body"
              classList=${() => ({ show: isOpen() })}
            >
              <div class="mask-fade-bottom">
                <div class="overflow-auto pe-1 search-accordion__scroll">
                  <div class="p-2 small">
                    <${Show} when=${() => c.reasoningContent?.reasoningText?.text}>
                      <pre class="mb-2 reasoning-pre text-prewrap font-monospace">
                        ${() => c.reasoningContent.reasoningText.text}
                      </pre
                      >
                    <//>

                    <${Show} when=${() => c.toolUse}>
                      <div class="mt-2">
                        <div class="text-body-tertiary mb-1">Input</div>
                        <pre class="reasoning-pre font-monospace mb-2">
                          ${() => stringify(c?.toolUse?.input)}</pre
                        >

                        <div class="text-body-tertiary mb-1">Result</div>
                        <pre class="reasoning-pre font-monospace mb-0">
                          ${() => stringify(getToolResult(c.toolUse))}</pre
                        >
                      </div>
                    <//>
                  </div>
                </div>
              </div>
            </div>
          </article>`;
        }
      }}
    <//>`;
}
