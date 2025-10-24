import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Index,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import html from "solid-js/html";

import { Trash2 } from "lucide-solid";

import { AlertContainer } from "../../../components/alert.js";
import AttachmentsPreview from "../../../components/attachments-preview.js";
import ClassToggle from "../../../components/class-toggle.js";
import Loader from "../../../components/loader.js";
import ScrollTo from "../../../components/scroll-to.js";
import Tooltip from "../../../components/tooltip.js";
import { useAuthContext } from "../../../contexts/auth-context.js";
import { alerts, clearAlert } from "../../../utils/alerts.js";

import DeleteConversation from "./delete-conversation.js";
import { useChat } from "./hooks.js";
import Message from "./message.js";

export default function Page() {
  const { user } = useAuthContext();

  const { conversation, deleteConversation, conversations, messages, loading, submitMessage } =
    useChat();
  const [toggles, setToggles] = createSignal({ conversations: true });
  const [isAtBottom, setIsAtBottom] = createSignal(true);
  const [chatHeight, setChatHeight] = createSignal(0);
  const [deleteConversationId, setDeleteConversationId] = createSignal(null);
  const [isStreaming, setIsStreaming] = createSignal(false);
  const isFedPulse = new URLSearchParams(location.search).get("fedpulse") === "1";
  let bottomEl;
  let chatRef;
  let inputFilesEl;
  let attachmentsReset;
  let formRef;

  const chatId = createMemo(() => new URLSearchParams(location.search).get("id") || "");
  const hasChatId = createMemo(() => chatId()?.length > 0 || conversation?.id?.length > 0);

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
      requestAnimationFrame(() => {
        bottomEl?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
      initScroll = true;
    }
  });

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !loading()) {
      event.preventDefault();
      event.target?.closest("form")?.requestSubmit();
    }
  }

  const toggle = (key) => (event) => {
    event.target.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const message = form.message.value;
    const inputFiles = form.inputFiles.files;
    const reasoningMode = form.reasoningMode.checked;
    const defaultModel = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
    const model = form.model?.value || defaultModel;
    setIsStreaming(true);
    await submitMessage({ message, inputFiles, reasoningMode, model, reset: clearChat() }).finally(
      () => setIsStreaming(false)
    );
  }

  function handleOnDeleteConversationClick(e, conversationId) {
    e.preventDefault();
    setDeleteConversationId(conversationId);
  }

  async function handleDeleteConversation() {
    if (!deleteConversationId()?.length) {
      return;
    }

    await deleteConversation(deleteConversationId(), { skipWindowConfirm: true });
    setDeleteConversationId(null);
  }

  function clearChat() {
    if (!formRef) {
      return;
    }

    formRef.message.value = "";
    formRef.inputFiles.value = "";
    attachmentsReset && attachmentsReset();
  }

  return html`
    <div class="container-fluid">
      <div class="row flex-nowrap min-vh-100 position-relative">
        <div
          class="col-sm-auto shadow-sm border-end px-0 position-sticky"
          classList=${() => ({ "w-20 mw-20r": toggles().conversations })}
        >
          <div class="d-flex flex-column p-3 position-sticky top-0 left-0 z-5 min-vh-100">
            <div
              class="d-flex justify-content-end align-items-center gap-2 text-dark mb-3 fw-semibold"
            >
              <${Tooltip}
                title=${() => (toggles().conversations ? "Close Sidebar" : "Open Sidebar")}
                placement="right"
                arrow=${true}
                class="text-white bg-primary"
              >
                <button
                  type="button"
                  class="btn btn-sm btn-light d-flex-center rounded-5 wh-2 p-0"
                  onClick=${toggle("conversations")}
                >
                  ${() =>
                    toggles().conversations
                      ? html`<img
                          src="assets/images/icon-panel-left-close.svg"
                          alt="Close Sidebar"
                          width="20"
                        />`
                      : html`<img
                          src="assets/images/icon-panel-left-open.svg"
                          alt="Open Sidebar"
                          width="20"
                        />`}
                </button>
              <//>
            </div>
            <div
              class="d-flex align-items-center gap-2 link-primary text-decoration-none mb-3 fw-semibold"
              title="New Chat"
            >
              <a
                href="/tools/chat"
                target="_self"
                class="btn btn-sm btn-primary d-flex-center rounded-5 wh-2 p-0"
              >
                <img src="assets/images/icon-plus.svg" alt="New Chat" width="16" />
              </a>
              <${Show} when=${() => toggles().conversations}>
                <${ClassToggle} class="dropdown d-flex-center" activeClass="show" event="hover">
                  <a toggle href="/tools/chat" target="_self" class="btn btn-sm p-0 dropdown-toggle"
                    >New Chat</a
                  >
                  <ul class="dropdown-menu top-100 start-0">
                    <li>
                      <a
                        title="General chat"
                        class="dropdown-item text-decoration-none small fw-normal"
                        href="/tools/chat"
                        target="_self"
                        >Standard Chat</a
                      >
                    </li>
                    <li>
                      <a
                        title="Search U.S. federal websites for policies, guidelines, executive orders, and other official content."
                        class="dropdown-item text-decoration-none small fw-normal"
                        href="/tools/chat?fedpulse=1"
                        target="_self"
                        >FedPulse</a
                      >
                    </li>
                  </ul>
                <//>
              <//>
            </div>

            <${Show} when=${() => toggles().conversations}>
              <small class="mb-2 fw-normal text-muted fs-6">
                Recent ${isFedPulse ? "FedPulse" : "Standard"} Chats</small
              >

              <ul class="list-unstyled">
                <${For} each=${conversations}>
                  ${(conv) => {
                    const href = isFedPulse
                      ? `/tools/chat?fedpulse=1&id=${conv.id}`
                      : `/tools/chat?id=${conv.id}`;
                    return html`<li class="convo-item small w-100 mb-2">
                      <a
                        href=${href}
                        target="_self"
                        class="convo-hitbox d-flex align-items-center px-3 py-2 text-decoration-none"
                      >
                        <div
                          class="convo-title text-primary fw-normal text-truncate flex-grow-1 min-w-0"
                          classList=${() => ({ active: conv.id === conversation?.id })}
                        >
                          ${conv.title}
                        </div>

                        <button
                          type="button"
                          class="action-btn btn btn-sm link-danger text-primary p-1 border-0 rounded-pill"
                          aria-label="Delete conversation"
                          title="Delete"
                          onClick=${(e) => handleOnDeleteConversationClick(e, conv.id)}
                        >
                          <${Trash2} size="18" color="currentColor" />
                        </button>
                      </a>
                    </li>`;
                  }}
                <//>
              </ul>
            <//>

            <${Show} when=${() => deleteConversationId()?.length > 0}>
              <${DeleteConversation}
                conversationId=${() => deleteConversationId()}
                onClose=${() => setDeleteConversationId(null)}
                onDelete=${handleDeleteConversation}
              />
            <//>
          </div>
        </div>
        <div class="col-sm bg-chat p-0 d-flex flex-column min-vh-100 min-w-0">
          <header
            class="chat-titlebar d-flex align-items-center justify-content-between border-bottom gap-2 px-3 py-2 bg-chat"
            role="banner"
          >
            <div class="d-flex align-items-center gap-2 min-w-0 text-body-secondary">
              <span class="badge rounded-pill text-bg-primary text-uppercase fw-semibold">
                ${() => (isFedPulse ? "FedPulse Chat" : "Standard Chat")}
              </span>

              <${Tooltip}
                title=${() => conversation?.title || "Untitled"}
                placement="bottom"
                arrow=${true}
                class="text-white bg-primary"
              >
                <div class="chat-title fw-semibold text-truncate">
                  ${() => conversation?.title || "Untitled"}
                </div>
              <//>
            </div>

            <${Show} when=${() => conversation?.id}>
              <div class="d-flex align-items-center gap-2 flex-shrink-0">
                <${Tooltip}
                  title="Delete chat"
                  placement="left"
                  arrow=${true}
                  class="text-white bg-primary"
                >
                  <button
                    type="button"
                    class="btn-unstyled header-icon-btn header-icon-btn--danger"
                    onClick=${(e) => handleOnDeleteConversationClick(e, conversation?.id)}
                    title="Delete chat"
                  >
                    <${Trash2} size="20" color="currentColor" />
                  </button>
                <//>
              </div>
            <//>
          </header>

          <form
            ref=${(el) => (formRef = el)}
            onSubmit=${handleSubmit}
            class="container d-flex flex-column flex-grow-1 mb-3 px-4 position-relative min-w-0"
          >
            <${AlertContainer} alerts=${alerts} onDismiss=${clearAlert} />

            <div
              class="flex-grow-1 py-3 min-width-0"
              classList=${() => ({ "x-mvh-100": messages.length > 0 })}
            >
              <${Index} each=${messages}>
                ${(message, index) => html`
                  <${Message}
                    message=${message}
                    index=${index}
                    messages=${messages}
                    isStreaming=${() => isStreaming}
                    class="small markdown shadow-sm rounded mb-3 p-2 position-relative"
                  />
                `}
              <//>
              <${Show} when=${loading}
                ><${Loader}
                  style="display: block; height: 1.1rem; width: 100%; margin: 1rem 0; opacity: 0.5"
              /><//>

              <div
                ref=${(el) => {
                  bottomEl = el;
                }}
                style=${() => `scroll-margin-bottom: ${chatHeight()}px`}
              />
            </div>
            <div
              class=${() =>
                `${hasChatId() ? "bottom-0 position-sticky" : "bottom-50 position-relative"}`}
            >
              <div class="text-center my-2 font-serif" hidden=${() => hasChatId()}>
                <h1 class="font-poppins fw-medium fs-1 lh-md text-deep-violet mb-2">
                  Welcome, ${() => user?.()?.firstName || ""}
                </h1>
                <div class="font-inter fw-medium fs-5 lh-md text-black small">
                  ${() =>
                    new URLSearchParams(location.search).get("fedpulse")
                      ? "Search U.S. federal websites for policies, guidelines, executive orders, and other official content."
                      : "How can I help you today?"}
                </div>
              </div>
              <${ScrollTo}
                targetRef=${() => bottomEl}
                hidden=${() => isAtBottom || messages.length === 0}
                label="Scroll to bottom"
              />
              <div
                ref=${(el) => {
                  chatRef = el;
                }}
              >
                <div
                  class="bg-white position-relative border-gray border-1 border-solid shadow-md rounded"
                >
                  <${AttachmentsPreview}
                    inputRef=${() => inputFilesEl}
                    onResetRef=${(fn) => (attachmentsReset = fn)}
                  />
                  <label for="message" class="visually-hidden">Chat Message</label>
                  <textarea
                    onKeyDown=${handleKeyDown}
                    class="form-control form-control-sm font-inter fw-normal fs-6 lh-md text-black resize-none border-0 bg-transparent shadow-0 p-3 pt-4 px-4"
                    id="message"
                    name="message"
                    placeholder="Ask me a question. (Shift + Enter for new line)"
                    rows="2"
                    autofocus
                    required
                  />

                  <div class="d-flex justify-content-between pt-1 pb-4 px-4">
                    <div class="d-flex w-auto align-items-center">
                      <${Tooltip}
                        title="Upload file(s) from your device"
                        placement="top"
                        arrow=${true}
                        class="text-white bg-primary"
                      >
                        <label class="btn btn-wide btn-wide-info px-3 py-3" for="inputFiles">
                          <input
                            ref=${(el) => (inputFilesEl = el)}
                            type="file"
                            id="inputFiles"
                            name="inputFiles"
                            aria-label="Input files"
                            class="visually-hidden"
                            accept="image/*,text/*,.pdf,.xls,.xlsx,.doc,.docx"
                            multiple
                          />
                          <img src="assets/images/icon-paperclip.svg" alt="Upload" height="19" />
                          Attach
                        </label>
                      <//>

                      <${Tooltip}
                        title="Enable this mode for more thorough responses to complex problems. Please note this requires additional time and resources."
                        placement="top"
                        arrow=${true}
                        class="text-white bg-primary"
                      >
                        <div
                          class="form-check form-switch form-switch-lg d-flex align-items-center gap-2 my-0 mx-2"
                        >
                          <input
                            class="form-check-input form-check-input-lg mt-0 cursor-pointer"
                            type="checkbox"
                            id="reasoningMode"
                            name="reasoningMode"
                          />
                          <label
                            class="form-check-label text-secondary fw-semibold cursor-pointer fs-6"
                            for="reasoningMode"
                          >
                            Deep Research Mode
                          </label>
                        </div>
                      <//>
                    </div>

                    <div class="d-flex w-auto align-items-center gap-2">
                      <${Show} when=${() => user?.()?.Role?.name === "admin"}>
                        <label for="model" class="visually-hidden">Model Selection</label>
                        <select
                          class="model-dropdown form-select form-select-lg fs-6 h-100 border-0 bg-primary-hover cursor-pointer"
                          name="model"
                          id="model"
                          required
                        >
                          <option value="us.anthropic.claude-opus-4-1-20250805-v1:0">
                            Opus 4.1
                          </option>
                          <option value="us.anthropic.claude-sonnet-4-5-20250929-v1:0" selected>
                            Sonnet 4.5
                          </option>
                          <option value="us.anthropic.claude-3-5-haiku-20241022-v1:0">
                            Haiku 3.5
                          </option>
                        </select>
                      <//>

                      <div class="d-flex flex-row gap-2">
                        <button
                          class="btn btn-wide btn-wide-info px-3 py-3"
                          type="button"
                          onClick=${() => clearChat()}
                        >
                          <img src="assets/images/icon-clear.svg" alt="Clear" />
                          Clear
                        </button>
                        <button
                          class="btn btn-wide px-3 py-3 btn-wide-primary"
                          type="submit"
                          disabled=${loading}
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="text-center bg-chat text-muted small py-1">
                  <span
                    class="me-1"
                    title="Your conversations are stored only on your personal device."
                  >
                    To maintain your privacy, we never retain your data on our systems.
                  </span>
                  Please double-check statements, as Research Optimizer can make mistakes.
                </div>
              </div>
            </div>
          </form>
        </div>
        <div
          class="col-sm-auto shadow-sm border-end px-0 position-sticky d-none"
          classList=${() => ({ "w-20": toggles().files })}
        >
          <div class="d-flex flex-column p-3 position-sticky top-0 left-0 z-5 min-vh-100">
            <div class="d-flex align-items-center gap-2 text-dark mb-3 fw-semibold">
              <button
                type="button"
                class="btn btn-sm btn-light d-flex-center rounded-5 wh-2 p-0"
                onClick=${toggle("files")}
              >
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
              title="New Chat"
            >
              <button type="button" class="btn btn-sm btn-primary d-flex-center rounded-5 wh-2 p-0">
                <img src="assets/images/icon-upload.svg" alt="Menu" width="16" />
              </button>
              <${Show} when=${() => toggles().files}>
                <small>New File</small>
              <//>
            </a>

            <${Show} when=${() => toggles().files}>
              <small class="mb-2 fw-normal text-muted"> Files </small>

              <ul class="list-unstyled">
                <${For} each=${() => [{ name: "test.txt" }]}>
                  ${(file) =>
                    html`<li
                      class="small w-100 mb-2 link-primary text-decoration-none fw-normal text-truncate w-100 d-inline-block"
                    >
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
