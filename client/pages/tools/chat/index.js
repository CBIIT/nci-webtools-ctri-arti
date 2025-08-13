import { createSignal, createResource, For, Show, Index } from "solid-js";
import html from "solid-js/html";
import Loader from "/components/loader.js";
import { AlertContainer } from "/components/alert.js";
import { downloadCsv, downloadJson } from "/utils/files.js";
import { useChat } from "./hooks.js";
import Message from "./message.js";
import { alerts, clearAlert } from "/utils/alerts.js";

export default function Page() {
  const [session] = createResource(() => fetch("/api/session").then(res => res.json()));
  const { conversation, updateConversation, deleteConversation, conversations, messages, loading, submitMessage } = useChat();
  const [toggles, setToggles] = createSignal({conversations: true});
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
    <div class="row">
      <div class="col-sm-auto">
        <${Show} when=${() => !toggles().conversations}>
          <div class="d-flex p-3 position-absolute z-3">
            <button type="button" class="btn btn-sm px-0" onClick=${toggle("conversations")}>
              <img src="assets/images/icon-history.svg" alt="Conversations" width="16" />
            </button>
          </div>
        <//>

        <aside
          class=${() => ["position-relative z-5 bg-light p-3 shadow h-100", toggles().conversations ? "d-block" : "d-none"].join(" ")}
          style="min-width: 300px;"
          tabindex="-1"
          id="conversations-menu"
          aria-labelledby="conversations-menu-label">
          <div class="d-flex mb-3">
            <button type="button" class="btn btn-sm px-0" onClick=${toggle("conversations")}>
              <img src="assets/images/icon-history.svg" alt="Conversations" width="16" />
            </button>          
          </div>
          <ul class="list-unstyled">
            <li class="mb-3">
              <a class="text-muted" href="/tools/chat" target="_blank">New Chat</a>
            </li>
            <li class="mb-2 fw-bold text-secondary">
              Recent
            </li>
            <${For} each=${conversations}>
              ${(conv) =>
                html`<li class="mb-2">
                  <a
                    class="link-primary text-decoration-none"
                    href=${`/tools/chat?id=${conv.id}`}
                    target="_self"
                    classList=${() => ({ active: conv.id === conversation?.id })}>
                    ${conv.title}
                  </a>
                </li>`}
            <//>
          </ul>
        </aside>
      </div>
      <div class="col-sm">
        <form onSubmit=${handleSubmit} class="container d-flex flex-column flex-grow-1 mb-3 position-relative">
          <${AlertContainer} alerts=${alerts} onDismiss=${clearAlert} />
          <div class="row">
            <div class="col d-flex align-items-center justify-content-between py-3">
              <div class="d-flex align-items-center">
                <div class="form-check form-switch form form-check-reverse form-control-sm my-0 me-2">
                  <input class="form-check-input" type="checkbox" id="fedpulse" name="fedpulse" />
                  <label
                    class="form-check-label text-secondary"
                    for="fedpulse"
                    title="Enable FedPulse">
                    FedPulse
                  </label>
                </div>
                <select class="form-select form-select-sm border-0 bg-light cursor-pointer" name="model" id="model" required>
                  <option value="us.anthropic.claude-opus-4-1-20250805-v1:0">Opus 4.1</option>
                  <option value="us.anthropic.claude-sonnet-4-20250514-v1:0" selected>Sonnet 4.0</option>
                  <option value="us.anthropic.claude-3-5-haiku-20241022-v1:0">Haiku 3.5</option>
                </select>
              </div>

              <${Show} when=${() => conversation?.id}>
                <button 
                  type="button"
                  class="btn btn-sm btn-outline-danger ms-2" 
                  onClick=${deleteConversation}
                  title="Delete conversation">
                  Delete
                </button>
              <//>
            </div>
          </div>

          <div class="flex-grow-1 py-3" classList=${() => ({ "x-mvh-100": messages.length > 0 })}>
            <div class="text-center my-5 font-serif" hidden=${() => messages.length > 0}>
              <h1 class="text-gradient fw-bold font-title mb-2">Welcome, ${() => session()?.user?.firstName || ''}</h1>
              <div class="text-secondary fw-semibold">How can I help you today?</div>
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
            <div class="bg-light shadow-sm rounded">
              <textarea
                class="form-control form-control-sm border-0 bg-transparent shadow-0"
                onKeyDown=${handleKeyDown}
                id="message"
                name="message"
                placeholder="Ask me (Shift + Enter for new line)"
                rows="3"
                autofocus
                required />

              <div class="d-flex justify-content-between py-1 px-2">
                <input
                  type="file"
                  id="inputFiles"
                  name="inputFiles"
                  aria-label="Input files"
                  class="form-control form-control-sm w-auto bg-transparent border-transparent"
                  accept="image/*,text/*,.pdf,.xls,.xlsx,.doc,.docx"
                  multiple />

                <div class="d-flex w-auto align-items-center">
                  <div class="form-check form-switch   form-control-sm me-2">
                    <input class="form-check-input" type="checkbox" id="reasoningMode" name="reasoningMode" />
                    <label
                      class="form-check-label text-secondary"
                      for="reasoningMode"
                      title="Enable this mode for more thorough responses to complex problems. Please note this requires additional time and resources.">
                      Research Mode
                    </label>
                  </div>
                  <button class="btn btn-primary btn-sm rounded-pill px-3" type="submit" style="border-radius: 0 0 var(--bs-border-radius-sm) 0">Send</button>
                </div>  
              </div>
            </div>
            <div class="text-center text-muted small py-1">
              <span class="me-1" title="Your conversations are stored only on your personal device.">
                To maintain your privacy, we never retain your data on our systems.
              </span>
              Please double-check statements, as Research Optimizer can make mistakes.
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
}
