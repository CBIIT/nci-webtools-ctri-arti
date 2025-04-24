import { createSignal } from "solid-js";
import html from "solid-js/html";
import { useSubmitMessage } from "./hooks.js";
import Message from "./message.js";
import DNASpinner from "/components/dna.js";

export default function Page() {
  const { conversation, updateConversation, conversations, messages, activeMessage, loading, submitMessage } = useSubmitMessage();
  const [toggles, setToggles] = createSignal({});
  const toggle = (key) => () => setToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.target?.closest("form")?.requestSubmit();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const message = form.message.value;
    const inputFiles = form.inputFiles.files;
    const reasoningMode = form.reasoningMode.checked;
    const model = form.model.value;
    const reset = () => {
      form.message.value = "";
      form.inputFiles.value = "";
    };
    await submitMessage({ message, inputFiles, reasoningMode, model, reset });
  }
  return html`
    <div class="container">
      <div class="row">
        <div class="col">
          <input
            value=${() => conversation()?.title}
            onChange=${(ev) => updateConversation({ title: ev.target.value })}
            class="form-control form-control-sm border-0 bg-transparent fw-light fs-5" />
        </div>
        <div class="col d-flex justify-content-end align-items-center">
          <button class="btn btn-outline-dark" onClick=${toggle("conversations")}>=</button>
        </div>
      </div>
    </div>

    <aside
      class=${() => ["offcanvas offcanvas-end", toggles().conversations ? "show" : "hiding"].join(" ")}
      tabindex="-1"
      id="conversations-menu"
      aria-labelledby="conversations-menu-label">
      <div class="offcanvas-header">
        <h5 class="offcanvas-title" id="conversations-menu-label">Conversations</h5>
        <button type="button" class="btn-close" aria-label="Close" onClick=${toggle("conversations")}></button>
      </div>
      <div class="offcanvas-body">
        <ul class="navbar-nav">
          <li class="nav-item">
            <a class="nav-link" href="agents/chat/">New Conversation</a>
          </li>
          ${() =>
            conversations().map(
              (conversation) =>
                html`<li class="nav-item">
                  <a class="nav-link" href=${`agents/chat/?id=${conversation.id}`}>${conversation.title}</a>
                </li>`
            )}
        </ul>
      </div>
    </aside>

    <main class="container d-flex flex-column flex-grow-1 mb-3 position-relative">
      <div class="flex-grow-1 py-3">
        <div class="text-center my-5 font-serif" hidden=${() => messages().length > 0}>
          <h1 class="text-gradient fw-bold font-title mb-2">Welcome to Research Optimizer</h1>
          <div class="text-secondary fw-semibold">How can we help you today?</div>
        </div>
        ${() => messages().map((message, i, all) => html`<${Message} message=${message} messages=${all} />`)}
        ${() => activeMessage() && html`<${Message} message=${activeMessage} active=${true} />`}
        ${() => loading() && html`<${DNASpinner} style="display: block; height: 1.1rem; width: 100%; margin: 1rem 0; opacity: 0.5" />`}
      </div>
      <div class="small text-end">
        <a href="/agents/chat" target="_blank">Start a new conversation</a>
      </div>
      <form onSubmit=${handleSubmit} class="bg-light shadow-sm rounded position-sticky bottom-0">
      <textarea
          class="form-control form-control-sm border-0 bg-transparent shadow-0"
          onKeyDown=${handleKeyDown}
          id="message"
          name="message"
          placeholder="Enter message (Shift + Enter for new line)"
          rows="3"
          autofocus
          required />

        <div class="d-flex justify-content-between">
          <input
            type="file"
            id="inputFiles"
            name="inputFiles"
            class="form-control form-control-sm w-auto bg-transparent border-transparent"
            accept="image/*,text/*,.pdf,.xls,.xlsx"
            multiple />

          <div class="input-group w-auto align-items-center">
            <div class="form-check form-switch form form-check-reverse form-control-sm">
              <input class="form-check-input" type="checkbox" id="reasoningMode" name="reasoningMode">
              <label class="form-check-label text-secondary" for="reasoningMode" title="Enable this mode for more thorough responses to complex problems. Please note this requires additional time and resources.">Extended Reasoning Mode</label>
            </div>
            <select class="form-select form-select-sm border-0 bg-transparent cursor-pointer" name="model" id="model" required hidden>
              <option value="us.anthropic.claude-3-7-sonnet-20250219-v1:0" selected>Sonnet</option>
              <option value="us.anthropic.claude-3-5-haiku-20241022-v1:0">Haiku</option>
            </select>
            <button class="btn btn-dark btn-sm" type="submit" style="border-radius: 0 0 var(--bs-border-radius-sm) 0">Send</button>
          </div>
        </div>
      </form>
      <small class="text-center text-muted py-1">To maintain your privacy, <span title="Your conversations are stored locally on your personal device, and are not accessible from any other device or context, including ours.">we never retain your data on our systems</span>. Please double-check statements, as Research Optimizer can make mistakes.</small>
      </small>
    </main>
  `;
}
