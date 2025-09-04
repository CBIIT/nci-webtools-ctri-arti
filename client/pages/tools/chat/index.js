import { createSignal, createResource, For, Show, Index, onMount, onCleanup, createEffect } from "solid-js";
import html from "solid-js/html";
import Loader from "/components/loader.js";
import ClassToggle from "/components/class-toggle.js";
import { AlertContainer } from "/components/alert.js";
import { downloadCsv, downloadJson } from "/utils/files.js";
import { useChat } from "./hooks.js";
import Message from "./message.js";
import { alerts, clearAlert } from "/utils/alerts.js";

export default function Page() {
  const [session] = createResource(() => fetch("/api/session").then((res) => res.json()));
  const { conversation, updateConversation, deleteConversation, conversations, messages, loading, submitMessage } = useChat();
  const [toggles, setToggles] = createSignal({ conversations: true });
  const [filenames, setFilenames] = createSignal([]);
  const [isAtBottom, setIsAtBottom] = createSignal(true);
  const [chatHeight, setChatHeight] = createSignal(0);
  const toggle = (key) => () =>
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  let bottomEl;
  let chatRef;

  function scrollToBottom() {
    requestAnimationFrame(() => {
      bottomEl?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }

  onMount(() => {
    const resizeObserver = new ResizeObserver(() => setChatHeight(chatRef.offsetHeight || 0));
    resizeObserver.observe(chatRef);

    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries[0]?.isIntersecting ?? false;
        if (isAtBottom() === isIntersecting) {
          return;
        }
        setIsAtBottom(isIntersecting);
      },
      { root: null, threshold: 0, rootMargin: `-${chatHeight()}px` }
    );

    observer.observe(bottomEl);

    onCleanup(() => {
      observer.disconnect();
      resizeObserver.disconnect();
    });
  });

  let initScroll = false;
  createEffect(() => {
    if (!initScroll && messages?.length > 0 && bottomEl) {
      scrollToBottom();
      initScroll = true;
    }
  });

  function handleFileChange(event) {
    let files = Array.from(event.target.files || []);
    setFilenames(files.map((file) => file.name));
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !loading()) {
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
    <div class="container-fluid">
      <div class="row min-vh-100 position-relative">
        <div class="col-sm-auto shadow-sm border-end px-0 position-sticky" classList=${() => ({ "w-20r": toggles().conversations })}>
          <div class="d-flex flex-column p-3 position-sticky top-0 left-0 z-5 min-vh-100">
            <div class="d-flex align-items-center gap-2 text-dark mb-3 fw-semibold">
              <button type="button" class="btn btn-sm btn-light d-flex-center rounded-5 wh-2 p-0" onClick=${toggle("conversations")}>
                <img src="assets/images/icon-bars.svg" alt="Menu" width="16" />
              </button>
              <${Show} when=${() => toggles().conversations}>
                <div class="btn btn-sm m-0 p-0 border-0">ARTI Chat</div>
              <//>
            </div>
            <div class="d-flex align-items-center gap-2 link-primary text-decoration-none mb-3 fw-semibold" title="New Chat">
              <a href="/tools/chat" target="_self" class="btn btn-sm btn-primary d-flex-center rounded-5 wh-2 p-0">
                <img src="assets/images/icon-plus.svg" alt="New Chat" width="16" />
              </a>
              <${Show} when=${() => toggles().conversations}>
                <${ClassToggle} class="dropdown d-flex-center" activeClass="show" event="hover">
                  <a toggle href="/tools/chat" target="_self" class="btn btn-sm p-0 dropdown-toggle">New Chat</a>
                  <ul class="dropdown-menu top-100 start-0">
                    <li><a title="General chat" class="dropdown-item text-decoration-none small fw-semibold" href="/tools/chat" target="_self">Standard Chat</a></li>
                    <li><a title="Search U.S. federal websites for policies, guidelines, executive orders, and other official content." class="dropdown-item text-decoration-none small fw-semibold" href="/tools/chat?fedpulse=1" target="_self">FedPulse</a></li>
                  </ul>
                <//>
              <//>
            </div>

            <${Show} when=${() => toggles().conversations}>
              <small class="mb-2 fw-normal text-muted fs-08"> Recent </small>

              <ul class="list-unstyled">
                <${For} each=${conversations}>
                  ${(conv) => {
                    const isFedPulse = new URLSearchParams(location.search).get("fedpulse") === "1";
                    const href = isFedPulse ? `/tools/chat?fedpulse=1&id=${conv.id}` : `/tools/chat?id=${conv.id}`;
                    return html`<li class="small w-100 mb-2">
                      <a
                        class="link-primary text-decoration-none fw-normal text-truncate w-100 d-inline-block"
                        href=${href}
                        target="_self"
                        classList=${() => ({ active: conv.id === conversation?.id })}>
                        ${conv.title}
                      </a>
                    </li>`;
                  }}
                <//>
              </ul>
            <//>
          </div>
        </div>
        <div class="col-sm">
          <form onSubmit=${handleSubmit} class="container d-flex flex-column flex-grow-1 mb-3 position-relative">
            <${AlertContainer} alerts=${alerts} onDismiss=${clearAlert} />
            <div class="row">
              <div class="col d-flex align-items-center justify-content-between py-3">
                <div class="d-flex align-items-center">
                  <div class="fw-semibold me-2">${() => (new URLSearchParams(location.search).get("fedpulse") ? "FedPulse" : "Chat")}</div>
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
                <h1 class="text-gradient fw-bold font-title mb-2">Welcome, ${() => session()?.user?.firstName || ""}</h1>
                <div class="text-secondary fw-semibold small">
                  ${() =>
                    new URLSearchParams(location.search).get("fedpulse")
                      ? "Search U.S. federal websites for policies, guidelines, executive orders, and other official content."
                      : "How can I help you today?"}
                </div>
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

              <div ref=${(el) => { bottomEl = el }} style=${() => `scroll-margin-bottom: ${chatHeight()}px`} />
            </div>
            <div class="position-sticky bottom-0">
              <div class="d-flex justify-content-center align-items-center pb-3" classList=${() => ({ "d-none": isAtBottom() })}>
                <button type="button" onClick=${scrollToBottom} class="btn btn-primary d-flex justify-content-center align-items-center text-nowrap fw-semibold pe-auto gap-2 rounded-pill px-[12px] ps-3 fs-08 focus-ring text-white">
                  <span class="pb-0">Scroll to bottom</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-1r h-1r"><path d="m6 9 6 6 6-6" /></svg>
                </button>
              </div>
              <div ref=${(el) => { chatRef = el }} class="bg-white">
                <div class="bg-light shadow-sm rounded">
                  <textarea
                    onKeyDown=${handleKeyDown}
                    class="form-control form-control-sm border-0 bg-transparent shadow-0 p-3"
                    id="message"
                    name="message"
                    placeholder="Ask me (Shift + Enter for new line)"
                    rows="3"
                    autofocus
                    required />

                  <div class="d-flex justify-content-between py-1 px-2">
                    <div class="d-flex w-auto align-items-center">
                      <label class="btn btn-light btn-sm rounded-pill m-0" for="inputFiles">
                        <input
                          onChange=${handleFileChange}
                          type="file"
                          id="inputFiles"
                          name="inputFiles"
                          aria-label="Input files"
                          class="visually-hidden"
                          accept="image/*,text/*,.pdf,.xls,.xlsx,.doc,.docx"
                          multiple />
                        <img src="assets/images/icon-paperclip.svg" alt="Upload" width="16" class="me-1" />
                        ${() => filenames().join(", ") || "Attach"}
                      </label>

                      <${ClassToggle} class="position-relative" activeClass="show" event="hover">
                        <div class="form-check form-switch form-control-sm my-0 mx-2" toggle>
                          <input class="form-check-input p-0 cursor-pointer" type="checkbox" id="reasoningMode" name="reasoningMode" />
                          <label
                            toggle
                            class="form-check-label text-secondary fw-semibold cursor-pointer"
                            for="reasoningMode"
                            title="Enable this mode for more thorough responses to complex problems. Please note this requires additional time and resources.">
                            Research Mode
                          </label>
                        </div>
                        <div class="tooltip shadow p-1 position-absolute top-100 start-0 p-2 bg-white border rounded w-200 ms-n50 text-muted text-center">
                          Enable this mode for more thorough responses to complex problems. Please note this requires additional time and resources.
                        </div>
                      <//>
                    </div>

                    <div class="d-flex w-auto align-items-center">
                      <button
                        class="btn btn-primary btn-sm rounded-pill px-3"
                        type="submit"
                        disabled=${loading}
                        style="border-radius: 0 0 var(--bs-border-radius-sm) 0">
                        Send
                      </button>
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
            </div>
          </form>
        </div>
        <div class="col-sm-auto shadow-sm border-end px-0 position-sticky d-none" classList=${() => ({ "w-20r": toggles().files })}>
          <div class="d-flex flex-column p-3 position-sticky top-0 left-0 z-5 min-vh-100">
            <div class="d-flex align-items-center gap-2 text-dark mb-3 fw-semibold">
              <button type="button" class="btn btn-sm btn-light d-flex-center rounded-5 wh-2 p-0" onClick=${toggle("files")}>
                <img src="assets/images/icon-bars.svg" alt="Menu" width="16" />
              </button>
              <${Show} when=${() => toggles().files}>
                <small>Files</small>
              <//>
            </div>
            <a
              href="/tools/chat"
              target="_self"
              class="d-flex align-items-center gap-2 link-primary text-decoration-none mb-3 fw-semibold"
              title="New Chat">
              <button type="button" class="btn btn-sm btn-primary d-flex-center rounded-5 wh-2 p-0">
                <img src="assets/images/icon-upload.svg" alt="Menu" width="16" />
              </button>
              <${Show} when=${() => toggles().files}>
                <small>New File</small>
              <//>
            </a>

            <${Show} when=${() => toggles().files}>
              <small class="mb-2 fw-normal text-muted fs-08"> Files </small>

              <ul class="list-unstyled">
                <${For} each=${() => [{ name: "test.txt" }]}>
                  ${(file) =>
                    html`<li class="small w-100 mb-2 link-primary text-decoration-none fw-normal text-truncate w-100 d-inline-block">
                      ${file.name}
                    </li>`}
                <//>
              </ul>
            <//>
          </div>
        </div>
      </div>
    </div>
  `;
}
