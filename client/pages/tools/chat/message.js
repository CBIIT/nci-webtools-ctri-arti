import { createSignal, For, onCleanup } from "solid-js";
import { ErrorBoundary } from "solid-js";

import html from "solid-js/html";

import { X } from "lucide-solid";

import BrowseTool from "../../../components/chat-tools/browse-tool.js";
import CodeTool from "../../../components/chat-tools/code-tool.js";
import EditorTool from "../../../components/chat-tools/editor-tool.js";
import ReasoningTool from "../../../components/chat-tools/reasoning-tool.js";
import SearchTool from "../../../components/chat-tools/search-tool.js";
import TextContent from "../../../components/chat-tools/text-content.js";

const TOOL_COMPONENTS = {
  search: SearchTool,
  browse: BrowseTool,
  code: CodeTool,
  editor: EditorTool,
  think: ReasoningTool,
};

export default function Message(p) {
  const [dialog, setDialog] = createSignal(null);
  const [visible, setVisible] = createSignal({});
  const [copied, setCopied] = createSignal(false);
  const [feedback, setFeedback] = createSignal(null);
  const toggleVisible = (key) => setVisible((prev) => ({ ...prev, [key]: !prev[key] }));

  const getToolResult = (toolUse) =>
    p.messages?.find((m) => m.content?.find((c) => c?.toolResult?.toolUseId === toolUse?.toolUseId))
      ?.content[0].toolResult?.content?.[0]?.json?.results;

  const getSearchResults = (results) =>
    results?.web ? [...(results.web || []), ...(results.news || [])] : [];

  let resetTimer;

  function openFeedback(feedback, comment) {
    const d = dialog();
    setFeedback(feedback ? "Positive Feedback" : "Negative Feedback");
    const f = d.querySelector("form");
    f.comment.value = comment || "";
    d.showModal();
  }

  async function submitFeedback(e) {
    e.preventDefault();
    e.stopPropagation();

    await dialog()?.close();
    if (!feedback) {
      return;
    }

    const comment = e.target.comment.value;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedback: [
          feedback(),
          "\ncomment:",
          comment,
          "\noriginal message:",
          p.message.content?.[0]?.text,
        ]
          .filter(Boolean)
          .join("\n"),
        context: p.messages,
      }),
    })
      .then((r) => r.json())
      .finally(() => setFeedback(null));
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

  return html`<dialog
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
          <div class="mt-2">
            <textarea
              id=${`feedback-comment-${p.index}`}
              aria-labelledby=${`fb-title-${p.index}`}
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

    <${ErrorBoundary} fallback=${(error) => console.log(error)}>
      <${For} each=${p.message?.content}>
        ${(c, i) => {
          if (c.text !== undefined) {
            const isLast = () => !p.isStreaming() && p?.index === p?.messages?.length - 1;

            return TextContent({
              role: p?.message?.role,
              message: c,
              messages: p?.messages,
              isLast,
              copied,
              onCopy: handleCopy,
              onFeedback: (result) => openFeedback(result),
            });
          }

          const name = c?.toolUse?.name || (c?.reasoningContent ? "think" : "unknown");
          const Component =
            TOOL_COMPONENTS[name] || (c?.reasoningContent ? ReasoningTool : undefined);

          if (!Component) {
            return null;
          }

          const base = c?.toolUse?.toolUseId || `${p.index}-${i()}`;
          const type = typeOfContent(c);
          const key = `${type}:${base}`;
          const isOpen = () => !!visible()[key];
          const bodyId = `${type}-acc-body-${safeId(base)}`;

          return Component({
            role: p?.message?.role,
            message: c,
            messages: p?.messages,
            isOpen,
            bodyId,
            results: getSearchResults(getToolResult(c.toolUse, p?.messages)),
            onToggle: () => toggleVisible(key),
          });
        }}
      <//>
    <//>`;
}

