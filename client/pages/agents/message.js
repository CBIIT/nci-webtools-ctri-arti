import { createSignal, For, Show, Index } from "solid-js";
import html from "solid-js/html";
import { stringify } from "yaml";
import { parse } from "marked";
import { downloadText, } from "./utils/utils.js";
import { getMarked } from "../../utils/utils.js";

const marked = getMarked();

export default function Message(p) {
  const [dialog, setDialog] = createSignal(null);
  const [visible, setVisible] = createSignal({});
  const toggleVisible = (key) => setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  const getToolResult = (toolUse) =>
    p.messages?.find((m) => m.content?.find((c) => c?.toolResult?.toolUseId === toolUse?.toolUseId))?.content[0].toolResult?.content[0]
      ?.json?.results;
  const getSearchResults = (results) => results?.web && [...results.web, ...results.news];

  function openFeedback(feedback, comment) {
    let d = dialog();
    let f = d.querySelector("form");
    f.feedback.value = feedback ? "Positive Feedback" : "Negative Feedback";
    f.comment.value = comment || "";
    d.showModal();
  }

  async function submitFeedback(e) {
    e.preventDefault();
    await dialog()?.close();
    let feedback = e.target.feedback.value;
    let comment = e.target.comment.value;
    const success = await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        feedback: [feedback, '\ncomment:', comment, '\noriginal message:', p.message.content?.[0]?.text].filter(Boolean).join('\n'),
        context: p.messages,
      })
    }).then(e => e.json());
  };
  
  return html`
    <dialog ref=${el => setDialog(el)} class="z-3 border-0 shadow-sm rounded-3" style="width: 400px; max-width: 100vw; max-height: 100vh; overflow: auto;">
      <form onSubmit=${submitFeedback}>
        <p class="fw-semibold">Submit Feedback</p>
        <div class="mb-2">
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="radio" name="feedback" id=${`feedback-positive-${p.index}`} value="Positive Feedback">
            <label class="form-check-label" for=${`feedback-positive-${p.index}`}>👍</label>
          </div>
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="radio" name="feedback" id=${`feedback-negative-${p.index}`} value="Negative Feedback">
            <label class="form-check-label" for=${`feedback-negative-${p.index}`}>👎</label>
          </div>
        </div>
        <textarea name="comment" placeholder="Comment..." rows="3" class="form-control form-control-sm mb-2"></textarea>
        <button type="reset" class="btn btn-secondary me-2" onClick=${() => dialog()?.close()}>Cancel</button>
        <button type="submit" class="btn btn-primary">Submit</button>
      </form>
    </dialog>
  
    <${For} each=${p.message?.content}>
      ${(c) => {
        if (c.text !== undefined) { // include empty text to start message
          return html`
            <div class="position-relative hover-visible-parent">
              <div
                class="p-2"
                classList=${{ "d-inline-block bg-light rounded": p.message.role === "user" }}
                innerHTML=${() => marked.parse(c.text || "")?.replace(/<metadata[\s\S]*?<\/metadata>/gi, '')}></div>
              <${Show} when=${() => p.message?.role !== "user"}>
                <div class="text-end end-0 top-0 opacity-50 position-absolute">
                  <button
                    class="btn btn-sm btn-outline-light border-0 hover-visible"
                    onClick=${(e) => openFeedback(true)}>
                    👍
                  </button>
                  <button
                    class="btn btn-sm btn-outline-light border-0 hover-visible"
                    onClick=${(e) => openFeedback(false)}>
                    👎
                  </button>
                  <button
                    class="btn btn-sm btn-outline-light border-0 hover-visible"
                    onClick=${() => downloadText("results.txt", c.text)}>
                    💾
                  </button>
                </div>
              <//>
            </div>
          `;
        }
        
        else if (c.toolUse?.name === "search") {
          return html`<details
            class="w-100 overflow-auto p-2 rounded mvh-25"
            classList=${() => ({ "shadow-sm": visible()[p.index] })}
            open=${() => visible()[p.index]}>
            <summary class="fw-semibold px-1 mb-2" onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}>
              Searching: ${() => c.toolUse?.input?.query}...
            </summary>
            <div class="list-group">
              <${For} each=${() => getSearchResults(getToolResult(c.toolUse))}>
                ${(result) => html`<a class="list-group-item list-group-item-action border-0" href=${result.url} target="_blank" rel="noopener noreferrer">
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
        }

        else if (c.toolUse?.name === "browse") {
          return html`<details
            class="w-100 overflow-auto p-2 rounded mvh-25"
            classList=${() => ({ "shadow-sm": visible()[p.index] })}
            open=${() => visible()[p.index]}>
            <summary class="fw-semibold px-1 mb-2" onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}>
              Researching: ${() => c.toolUse?.input?.url}...
            </summary>
            <div class="fw-semibold mb-2 text-muted">${() => c.toolUse?.input?.topic}</div>
            <div innerHTML=${() => parse(getToolResult(c.toolUse) || "")} />
          </details>`;
        }

        else if (c.toolUse?.name === "code") {
          return html`<details
            class="w-100 overflow-auto p-2 rounded hover-visible-parent position-relative"
            classList=${() => ({ "shadow-sm": visible()[p.index] })}
            open=${() => visible()[p.index]}>
            <summary class="fw-semibold  px-1 mb-2" onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}>
              Writing Code...
            </summary>
            <${Show} when=${() => getToolResult(c.toolUse)?.html}>
              <iframe srcdoc=${() => c.toolUse?.input?.source} height=${() => getToolResult(c.toolUse)?.height + 20 || "auto"} style="width: 100%; border: none;"></iframe>
            <//>
            <div class="text-end end-0 top-0 opacity-50 position-absolute">
              <button
                class="btn btn-sm btn-outline-light border-0 hover-visible"
                onClick=${() => downloadText('code' + ({
                    'javascript': '.js',
                    'html': '.html',
                  }[c.toolUse?.input?.language] || '.txt'), c.toolUse?.input?.source)}>
                💾
              </button>
            </div>
            <pre class="small mb-3 text-muted">${() => c.toolUse?.input?.source}</pre>
            <pre class="small mb-0">${() => getToolResult(c.toolUse)?.logs?.join?.("\n")}</pre>
          </details>`;
        }

        else if (c.toolUse?.name === "editor") {
          return html`<details
            class="w-100 overflow-auto p-2 rounded mvh-25"
            classList=${() => ({ "shadow-sm": visible()[p.index] })}
            open=${() => visible()[p.index]}>
            <summary class="fw-semibold px-1 mb-2" onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}>
              ${() => ({
                view: "Viewing",
                str_replace: "Updating",
                create: "Creating",
                insert: "Updating",
                undo_edit: "Undoing Edit",
              }[c.toolUse?.input?.command])}  
              File: ${() => c.toolUse?.input?.path}
            </summary>
            <div class="text-prewrap">${() => c.toolUse?.input?.new_str}</div>
            <div class="text-prewrap" innerHTML=${() => parse(getToolResult(c.toolUse) || "")?.trim()} />
          </details>`;
        }

        else if (c.reasoningContent || c.toolUse) {
          
          return html`<details
            class="w-100 overflow-auto p-2 rounded mvh-25"
            classList=${() => ({ "shadow-sm": visible()[p.index] })}
            open=${() => visible()[p.index]}>
            <summary class="fw-semibold px-1 mb-2" onClick=${(e) => (e.preventDefault(), toggleVisible(p.index))}>
              ${() => (c.reasoningContent || c.toolUse?.name === "think" ? "Reasoning..." : c?.toolUse?.name)}
            </summary>
            <div class="text-prewrap">
              <${Show} when=${() => c.reasoningContent?.reasoningText?.text}>
                ${() => c.reasoningContent.reasoningText.text}
              <//>
              <${Show} when=${() => c.toolUse}>
                ${() => html`${stringify(c?.toolUse?.input)} ${stringify(getToolResult(c.toolUse))}`}
              <//>
            </div>
          </details>`;
        }
      }}
    <//>`;
}
