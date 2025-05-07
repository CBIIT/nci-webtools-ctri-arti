import html from "solid-js/html";
import { For, Show, createSignal } from "solid-js";
import { parse } from "marked";
import { stringify } from "yaml";
import { downloadText } from "./utils/utils.js";

/**
 * 
 * @param {{message, messages, defaultClass}} p 
 * @returns 
 */
export default function Message(p = {
  message: null,
  messages: [],
  class: "small markdown shadow-sm rounded mb-3 p-2 position-relative",
}) {
  const [dialog, setDialog] = createSignal(null);
  const messageIndex = (p.messages || []).indexOf(p.message);

  if (!p.message) return null;
  const getToolResult = (messages, toolUseId) => {
    console.log(messages,  toolUseId, messages?.find((m) => m.content?.[0]?.toolResult?.toolUseId === toolUseId));
    return messages?.find((m) => m.content?.[0]?.toolResult?.toolUseId === toolUseId)?.content[0].toolResult?.content[0]?.json?.results;
  }
  const renderMessageContent = (c, m) => (m.role === "user" ? { textContent: c.text.trim() } : { innerHTML: parse(c.text)?.trim() });
  const debug = location.hostname === "localhost";

  if (!p.message || !p.message.content || !p.message.content.length) return null;

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
            <input class="form-check-input" type="radio" name="feedback" id=${`feedback-positive-${messageIndex}`} value="Positive Feedback">
            <label class="form-check-label" for=${`feedback-positive-${messageIndex}`}>👍</label>
          </div>
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="radio" name="feedback" id=${`feedback-negative-${messageIndex}`} value="Negative Feedback">
            <label class="form-check-label" for=${`feedback-negative-${messageIndex}`}>👎</label>
          </div>
        </div>
        <textarea name="comment" placeholder="Comment..." rows="3" class="form-control form-control-sm mb-2"></textarea>
        <button type="reset" class="btn btn-secondary me-2" onClick=${() => dialog()?.close()}>Cancel</button>
        <button type="submit" class="btn btn-primary">Submit</button>
      </form>
    </dialog>

    <div class="d-flex flex-wrap position-relative ">
      <${For} each=${p.message.content}>${(c) => {
        if (c.text) {
          return html`
            <span class=${() => [p.class, "mb-3 hover-visible-parent-always", p.message.role === "user" ? "bg-light text-prewrap" : "w-100 bg-white"].join(" ")}>
              <${Show} when=${() => p.message.role !== "user"}>
                <div class="hover-visible-always position-absolute top-0 end-0 opacity-50">
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
              <span ...${renderMessageContent(c, p.message)}></span>
            </span>
          `;
        } else if (c.reasoningContent?.reasoningText?.text) {
          return html`
            <details class=${[p.class, "w-100 overflow-auto bg-white"].join(" ")} style="max-height: 200px">
              <summary>Reasoning...</summary>
              <div class="text-prewrap">${c.reasoningContent.reasoningText.text}</div>
            </details>
          `;
        } else if (c.toolUse) {
          const { name, input, toolUseId } = c.toolUse;
          const result = getToolResult(p.messages, toolUseId);

          switch (c.toolUse.name) {
            case "think":
              return html`
                <details class=${[p.class, "w-100 overflow-auto bg-white"].join(" ")} style="max-height: 200px">
                  <summary>Reasoning...</summary>
                  <div class="text-prewrap">${c.toolUse.input?.thought}</div>
                </details>
              `;
            case "code":
              return html`
                <span class=${[p.class, "w-100 overflow-auto bg-white"].join(" ")}>
                  <details class=${["markdown text-prewrap text-muted"].join(" ")}>
                    <summary>Writing Code...</summary>
                    <pre class="small mb-0">${input?.source}</pre>
                  </details>
                  ${result?.height > 0 &&
                  html`<iframe srcdoc=${result?.html} height=${result?.height + 20 || "auto"} style="width: 100%; border: none;"></iframe>
                    <button
                      class="btn btn-sm btn-outline-light hover-visible  position-absolute top-0 end-0 border-0 opacity-50"
                      onClick=${() => downloadText("results.html", result?.html)}>
                      💾</button
                    >}`}
                  <pre class="mb-0">${result?.logs?.join?.("\n") || result?.logs}</pre>
                </span>
              `;
            case "browse":
              return html`
                <details class=${[p.class, "w-100 overflow-auto bg-white"].join(" ")}>
                  <summary>Browsing <a target="_blank" rel="noopener noreferrer" href=${input.url}>${input.url}</a></summary>
                  <small class="fw-semibold">${input?.topic}</small>
                  <div class="small" innerHTML=${parse(result || "")}></div>
                </details>
              `;
            case "editor":
              return html`
                <details open="open" class=${[p.class, "w-100 overflow-auto bg-white"].join(" ")}>
                  <summary>File: ${input?.path}</summary>
                  ${input?.file_text &&
                  html`<button
                      class="btn btn-sm btn-outline-light hover-visible  position-absolute top-0 end-0 border-0 opacity-50"
                      onClick=${() => downloadText(input?.path, input.file_text)}>
                      💾
                    </button>
                    <div class="small text-prewrap">${input?.file_text}</div>`}
                  ${input?.new_str &&
                  html`<button
                      class="btn btn-sm btn-outline-light hover-visible  position-absolute top-0 end-0 border-0 opacity-50"
                      onClick=${() => downloadText(input?.path, input.new_str)}>
                      💾
                    </button>
                    <div class="small text-prewrap">${input?.new_str}</div>`}
                  <div class="small text-prewrap">
                    <button
                      class="btn btn-sm btn-outline-light hover-visible  position-absolute top-0 end-0 border-0 opacity-50"
                      onClick=${() => downloadText(input.path, result.replace(/^\s*\d+\s*\:\s*/g, ""))}
                      hidden=${() => input?.command !== "view"}>
                      💾
                    </button>
                    ${result}
                  </div>
                </details>
              `;
            default:
              const defaultResults = [[name, stringify(input)].join(" "), stringify(result)?.trim()].filter(Boolean).join("\n").trim();
              return html`
                <span class=${[p.class, "w-100 overflow-auto bg-white"].join(" ")} style="max-height: 200px">
                  <button
                    class="btn btn-sm btn-outline-light hover-visible  position-absolute top-0 end-0 border-0 opacity-50"
                    onClick=${() => downloadText("results.txt", defaultResults)}>
                    💾
                  </button>
                  <pre class="mb-0 text-prewrap text-muted">${defaultResults}</pre>
                </span>
              `;
          }
        }



      }}<//>
    </div>
  `;
}
