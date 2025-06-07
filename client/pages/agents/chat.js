import { createSignal, For, Show, Index } from "solid-js";
import html from "solid-js/html";
import Loader from "/components/dna.js";
import { downloadCsv, downloadJson, openInternalLinkInNewTab } from "/utils/utils.js";
import { useChat } from "./hooks.js";
import Message from "./message.js";

export default function Page() {
  const { conversation, updateConversation, conversations, messages, loading, submitMessage } = useChat();
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
        <div class="col d-flex align-items-center">
          <button class="btn btn-sm btn-light d-flex align-items-center" onClick=${toggle("conversations")}>
            <img src="assets/images/icon-history.svg" alt="Conversations" width="16" />
          </button>
          <input
            value=${() => conversation?.title}
            onChange=${(ev) => updateConversation({ title: ev.target.value })}
            class="form-control form-control-sm fw-semibold border-0 bg-transparent " />
        </div>
      </div>
    </div>


    <aside
      class=${() => ["offcanvas offcanvas-start", toggles().conversations ? "show" : "hiding"].join(" ")}
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
            <a class="nav-link" href="/tools/chat" onClick=${(e) => openInternalLinkInNewTab(e)}>New Conversation</a>
          </li>
          <${For} each=${conversations}>
            ${(conversation) =>
              html`<li class="nav-item">
                <a
                  class="nav-link"
                  href=${`agents/chat/?id=${conversation.id}`}
                  classList=${() => ({ active: conversation.id === conversation()?.id })}>
                  ${conversation.title}
                </a>
              </li>`}
          <//>
        </ul>
      </div>
    </aside>

    <main class="container d-flex flex-column flex-grow-1 mb-3 position-relative">
      <div class="flex-grow-1 py-3" classList=${() => ({ "x-mvh-100": messages.length > 0 })}>
        <div class="text-center my-5 font-serif" hidden=${() => messages.length > 0}>
          <h1 class="text-gradient fw-bold font-title mb-2">Welcome</h1>
          <div class="text-secondary fw-semibold">How can we help you today?</div>
        </div>
        <${Index} each=${messages}>
          ${(message, index) => html`
            <${Message}
              message=${message}
              index=${index}
              messages=${messages}
              class="small markdown shadow-sm rounded mb-3 p-2 position-relative" />
          `}
        <//>
        <${Show} when=${loading}><${Loader} style="display: block; height: 1.1rem; width: 100%; margin: 1rem 0; opacity: 0.5" /><//>
      </div>
      <div class="position-sticky bottom-0 bg-white">
        <div class="small d-flex justify-content-between">
          <div class="d-flex align-items-center">
            Export as
            <button
              class="btn btn-sm p-0 btn-link mx-1"
              onClick=${() =>
                downloadCsv(
                  "conversation.csv",
                  messages.map((m) => ({
                    role: m.role,
                    content: m.content
                      ?.map((c) => c.text)
                      .filter(Boolean)
                      .map(e => e.trim())
                      .join("\n"),
                  }))
                )}>
              csv
            </button>
            or
            <button class="btn btn-sm p-0 btn-link mx-1" onClick=${() => downloadJson("conversation.json", messages)}>json</button>
          </div>
          <a href="/tools/chat" onClick=${(e) => openInternalLinkInNewTab(e)}>Start a new conversation</a>
        </div>
        <form onSubmit=${handleSubmit} class="bg-light shadow-sm rounded">
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
                <input class="form-check-input" type="checkbox" id="reasoningMode" name="reasoningMode" />
                <label
                  class="form-check-label text-secondary"
                  for="reasoningMode"
                  title="Enable this mode for more thorough responses to complex problems. Please note this requires additional time and resources.">
                  Extended Thinking Mode
                </label>
              </div>
              <select class="form-select form-select-sm border-0 bg-transparent cursor-pointer" name="model" id="model" required>
                <option value="us.anthropic.claude-opus-4-20250514-v1:0">Opus</option>
                <option value="us.anthropic.claude-sonnet-4-20250514-v1:0" selected>Sonnet</option>
                <option value="us.anthropic.claude-3-5-haiku-20241022-v1:0">Haiku</option>
              </select>
              <button class="btn btn-dark btn-sm ms-2" type="submit" style="border-radius: 0 0 var(--bs-border-radius-sm) 0">Send</button>
            </div>
          </div>
        </form>
        <div class="text-center text-muted small py-1">
          <span class="me-1" title="Your conversations are stored only on your personal device.">
            To maintain your privacy, we never retain your data on our systems.
          </span>
          Please double-check statements, as Research Optimizer can make mistakes.
        </div>
      </div>
    </main>
  `;
}
