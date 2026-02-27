// =================================================================================
// CHAT V2 - Full UI (V1 Design) with V2 Logic
// =================================================================================

import {
  createEffect,
  createMemo,
  createSignal,
  createResource,
  For,
  Index,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from "solid-js";
import html from "solid-js/html";

import { EllipsisVertical, Pencil, Trash2 } from "lucide-solid";

import { AlertContainer } from "../../../components/alert.js";
import AttachmentsPreview from "../../../components/attachments-preview.js";
import ClassToggle from "../../../components/class-toggle.js";
import Loader from "../../../components/loader.js";
import ScrollTo from "../../../components/scroll-to.js";
import Tooltip from "../../../components/tooltip.js";

import { useAuthContext } from "../../../contexts/auth-context.js";
import { MODEL_OPTIONS } from "../../../models/model-options.js";
import { alerts, clearAlert } from "../../../utils/alerts.js";

import DeleteConversation from "./delete-conversation.js";
import { useAgent, getDB } from "./hooks.js";
import Message from "./message.js";

const MAX_TITLE_LENGTH = 30;

// =================================================================================
// EXPORTED PAGE COMPONENT (for router)
// =================================================================================

export default function Page() {
  // Support ?db=indexeddb to force local storage, default to server with fallback
  const searchParams = new URLSearchParams(window.location.search);
  const dbType = searchParams.get("db") || "server";
  const [db] = createResource(() => getDB(dbType));

  return html`
    <${Suspense} fallback=${html`<div class="container my-5"><p>Loading...</p></div>`}>
      <${Show} when=${db}>
        <${ChatApp} db=${db} />
      <//>
    <//>
  `;
}

// =================================================================================
// INTERNAL CHAT APPLICATION
// =================================================================================

function ChatApp(props) {
  const { user } = useAuthContext();

  const searchParams = new URLSearchParams(window.location.search);
  const urlParams = Object.fromEntries(searchParams.entries());

  const {
    agent,
    params,
    setParams,
    sendMessage,
    threads,
    loadThreads,
    updateThread,
    deleteThread,
    generateThreadTitle,
  } = useAgent(urlParams, props.db);

  // Fetch available agents for the dropdown
  const fetchAgents = async () => {
    const response = await fetch("/api/v1/agents");
    if (!response.ok) return [];
    return response.json();
  };
  const [agents] = createResource(fetchAgents);

  // UI State (from V1)
  const [toggles, setToggles] = createSignal({ conversations: true });
  const [isAtBottom, setIsAtBottom] = createSignal(true);
  const [chatHeight, setChatHeight] = createSignal(0);
  const [deleteThreadId, setDeleteThreadId] = createSignal(null);
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [openMenu, setOpenMenu] = createSignal(null);
  const [editingState, setEditingState] = createSignal({ id: null, context: null, title: "" });

  // Refs
  let titleInputRef;
  let bottomEl;
  let chatRef;
  let inputFilesEl;
  let attachmentsReset;
  let formRef;

  // Computed values
  const hasThreadId = createMemo(() => params.threadId || agent.thread?.id);

  // URL sync effect
  createEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (params.agentId) searchParams.set("agentId", params.agentId);
    if (params.threadId) {
      searchParams.set("threadId", params.threadId);
    } else {
      searchParams.delete("threadId");
    }
    const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
    window.history.replaceState({}, "", newUrl);
  });

  // Editing helpers
  const isEditing = (context, threadId) => {
    const state = editingState();
    return state.context === context && state.id === threadId;
  };

  const isMenuOpen = (threadId) => {
    const menu = openMenu();
    return menu?.type === "thread" && menu?.id === threadId;
  };

  const updateEditingTitle = (value) =>
    setEditingState((prev) => {
      const newTitle = (value.trim() || "").slice(0, MAX_TITLE_LENGTH);
      if (newTitle === prev.title) return prev;
      return { ...prev, title: newTitle };
    });

  function stopEditingTitle() {
    setEditingState({ id: null, context: null, title: "" });
  }

  // Document click handler for closing menus
  const handleDocumentClick = (event) => {
    const target = event.target;
    const inDropdownOrToggle =
      target.closest(".dropdown-menu") ||
      target.closest(".header-icon-btn") ||
      target.closest(".action-btn");
    const inTitleInput = target.closest(".convo-title input, .chat-title input");

    if (!inDropdownOrToggle && !inTitleInput) {
      setOpenMenu(null);
      stopEditingTitle();
    }
  };

  // Mount effects
  onMount(() => {
    const resizeObserver = new ResizeObserver(() => setChatHeight(chatRef?.offsetHeight || 0));
    if (chatRef) resizeObserver.observe(chatRef);

    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries[0]?.isIntersecting ?? false;
        if (isAtBottom() !== isIntersecting) {
          setIsAtBottom(isIntersecting);
        }
      },
      { root: null, threshold: 0, rootMargin: `-${chatHeight()}px` }
    );

    if (bottomEl) observer.observe(bottomEl);

    document.addEventListener("click", handleDocumentClick, true);

    onCleanup(() => {
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("click", handleDocumentClick, true);
    });
  });

  // Initial scroll effect
  let initScroll = false;
  createEffect(() => {
    if (!initScroll && agent.messages?.length > 0 && bottomEl) {
      requestAnimationFrame(() => {
        bottomEl?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
      initScroll = true;
    }
  });

  // Event handlers
  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !agent.loading) {
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
    const text = form.message.value;
    const files = Array.from(form.inputFiles?.files || []);
    const reasoningMode = form.reasoningMode.checked;
    const defaultModel = MODEL_OPTIONS.AWS_BEDROCK.SONNET.v4_6;
    const modelId = form.model?.value || defaultModel;

    form.message.value = "";
    if (form.inputFiles) form.inputFiles.value = "";
    attachmentsReset?.();

    const isFirstMessage = agent.messages?.length === 0;
    setIsStreaming(true);

    try {
      await sendMessage(text, files, modelId, reasoningMode);

      // Generate title after first exchange
      if (isFirstMessage) {
        await generateThreadTitle(MODEL_OPTIONS.AWS_BEDROCK.HAIKU.v4_5);
      }
    } finally {
      setIsStreaming(false);
    }
  }

  function handleDeleteThreadClick(e, threadId) {
    e.preventDefault();
    setDeleteThreadId(threadId);
  }

  async function handleDeleteThread() {
    const threadId = deleteThreadId();
    if (!threadId) return;

    await deleteThread(threadId);
    setDeleteThreadId(null);
  }

  function clearChat() {
    if (!formRef) return;
    formRef.message.value = "";
    if (formRef.inputFiles) formRef.inputFiles.value = "";
    attachmentsReset?.();
  }

  function startEditingTitle(threadId, currentTitle, context) {
    if (!threadId) return;
    const rawTitle = currentTitle?.trim()?.length > 0 ? currentTitle : "Untitled";
    const title = rawTitle.slice(0, MAX_TITLE_LENGTH);
    setEditingState({ id: threadId, context, title });
    setOpenMenu(null);
  }

  async function handleTitleKeyDown(event, threadId) {
    if (event.key !== "Enter" && event.key !== "Escape") return;
    event.preventDefault();
    if (event.key === "Enter") {
      onTitleSubmit(threadId);
      return;
    }
    stopEditingTitle();
  }

  async function onTitleSubmit(threadId) {
    const { title } = editingState() || {};
    const newTitle = title?.trim() || "";

    if (!newTitle || !threadId) {
      stopEditingTitle();
      return;
    }

    try {
      await updateThread(threadId, { name: newTitle });
    } finally {
      stopEditingTitle();
    }
  }

  function handleThreadMenuToggle(event, threadId) {
    event.preventDefault();
    event.stopPropagation();
    setOpenMenu((prev) =>
      prev?.type === "thread" && prev?.id === threadId ? null : { type: "thread", id: threadId }
    );
  }

  function handleThreadMenuEdit(event, thread) {
    event.preventDefault();
    event.stopPropagation();
    startEditingTitle(thread.id, thread.name, "sidebar");
  }

  function handleThreadMenuDelete(event, threadId) {
    event.preventDefault();
    event.stopPropagation();
    setOpenMenu(null);
    handleDeleteThreadClick(event, threadId);
  }

  function attachAndFocusTitleInput(el) {
    if (!el) return;
    titleInputRef = el;
    requestAnimationFrame(() => {
      if (!titleInputRef) return;
      titleInputRef.focus();
      if (typeof titleInputRef.setSelectionRange === "function") {
        titleInputRef.setSelectionRange(0, titleInputRef.value?.length ?? 0);
      }
    });
  }

  // =================================================================================
  // RENDER
  // =================================================================================

  return html`
    <div class="container-fluid">
      <div class="row flex-nowrap min-vh-100 position-relative">
        <!-- SIDEBAR -->
        <div
          class="col-sm-auto shadow-sm border-end px-0 position-sticky z-2"
          classList=${() => ({ "w-20 mw-20r": toggles().conversations })}
        >
          <div class="d-flex flex-column p-3 position-sticky top-0 left-0 z-5 min-vh-100">
            <!-- Toggle Button -->
            <div class="d-flex justify-content-end align-items-center gap-2 text-dark mb-3 fw-semibold">
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
                      ? html`<img src="assets/images/icon-panel-left-close.svg" alt="Close Sidebar" width="20" />`
                      : html`<img src="assets/images/icon-panel-left-open.svg" alt="Open Sidebar" width="20" />`}
                </button>
              <//>
            </div>

            <!-- New Chat Button -->
            <div class="d-flex align-items-center gap-2 link-primary text-decoration-none mb-3 fw-semibold" title="New Chat">
              <a
                href=${() => `/tools/chat-v2?agentId=${params.agentId || 1}`}
                target="_self"
                class="btn btn-sm btn-primary d-flex-center rounded-5 wh-2 p-0"
              >
                <img src="assets/images/icon-plus.svg" alt="New Chat" width="16" />
              </a>
              <${Show} when=${() => toggles().conversations}>
                <${ClassToggle} class="dropdown d-flex-center" activeClass="show" event="hover">
                  <a toggle href=${() => `/tools/chat-v2?agentId=${params.agentId || 1}`} target="_self" class="btn btn-sm p-0 dropdown-toggle">
                    New Chat
                  </a>
                  <ul class="dropdown-menu top-100 start-0">
                    <${For} each=${() => agents() || []}>
                      ${(agentItem) => html`
                        <li>
                          <a
                            title=${() => agentItem.name}
                            class="dropdown-item text-decoration-none small fw-normal"
                            href=${() => `/tools/chat-v2?agentId=${agentItem.id}`}
                            target="_self"
                          >${() => agentItem.name}</a>
                        </li>
                      `}
                    <//>
                  </ul>
                <//>
              <//>
            </div>

            <!-- Thread List -->
            <${Show} when=${() => toggles().conversations}>
              <small class="mb-2 fw-normal text-muted fs-6">Recent Chats</small>

              <ul class="list-unstyled">
                <${For} each=${threads}>
                  ${(thread) => {
                    const href = `/tools/chat-v2?agentId=${params.agentId || 1}&threadId=${thread.id}`;
                    return html`<li class="convo-item small w-100 mb-2">
                      <a
                        href=${href}
                        target="_self"
                        class="convo-hitbox d-flex align-items-center px-3 py-2 text-decoration-none"
                      >
                        <div
                          class="convo-title text-primary fw-normal text-truncate flex-grow-1 min-w-0"
                          classList=${() => ({ active: thread.id === params.threadId })}
                        >
                          <${Show}
                            when=${() => isEditing("sidebar", thread.id)}
                            fallback=${() => thread.name || "Untitled"}
                          >
                            <input
                              type="text"
                              class="form-control form-control-sm bg-transparent border-0 shadow-none px-0 py-0 text-primary fw-normal"
                              value=${() => editingState().title}
                              maxlength=${MAX_TITLE_LENGTH}
                              onInput=${(event) => updateEditingTitle(event.currentTarget.value || "")}
                              onKeyDown=${(event) => handleTitleKeyDown(event, thread.id)}
                              onBlur=${() => stopEditingTitle()}
                              onClick=${(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              ref=${attachAndFocusTitleInput}
                            />
                          <//>
                        </div>

                        <${Show} when=${() => !isEditing("sidebar", thread.id)}>
                          <div class="dropdown ms-2 position-relative">
                            <button
                              type="button"
                              class="action-btn btn btn-sm link-dark text-primary p-1 border-0 rounded-pill"
                              aria-label="Chat options"
                              title="Chat options"
                              onClick=${(event) => handleThreadMenuToggle(event, thread.id)}
                            >
                              <${EllipsisVertical} size="18" color="currentColor" />
                            </button>
                            <ul
                              class="dropdown-menu mt-1 show"
                              hidden=${() => !isMenuOpen(thread.id)}
                              onClick=${(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                            >
                              <li>
                                <button
                                  type="button"
                                  class="dropdown-item small d-flex align-items-center"
                                  onClick=${(event) => handleThreadMenuEdit(event, thread)}
                                >
                                  <${Pencil} size="18" color="black" class="me-2" />
                                  Edit title
                                </button>
                              </li>
                              <li>
                                <button
                                  type="button"
                                  class="dropdown-item small text-danger d-flex align-items-center"
                                  onClick=${(event) => handleThreadMenuDelete(event, thread.id)}
                                >
                                  <${Trash2} size="18" color="currentColor" class="me-2" />
                                  Delete
                                </button>
                              </li>
                            </ul>
                          </div>
                        <//>
                      </a>
                    </li>`;
                  }}
                <//>
              </ul>
            <//>

            <!-- Delete Confirmation Modal -->
            <${Show} when=${() => deleteThreadId()}>
              <${DeleteConversation}
                conversationId=${() => deleteThreadId()}
                onClose=${() => setDeleteThreadId(null)}
                onDelete=${handleDeleteThread}
              />
            <//>
          </div>
        </div>

        <!-- MAIN CONTENT AREA -->
        <div class="col-sm bg-chat p-0 d-flex flex-column min-vh-100 min-w-0">
          <!-- Header -->
          <header
            class="chat-titlebar d-flex align-items-center justify-content-between border-bottom gap-2 px-3 py-2 bg-chat"
            role="banner"
          >
            <div class="d-flex align-items-center gap-2 min-w-0 text-body-secondary">
              <span class="badge rounded-pill text-bg-primary text-uppercase fw-semibold">
                ${() => agent.name || "Chat"}
              </span>

              <${Tooltip}
                title=${() => agent.thread?.name || "Untitled"}
                placement="bottom"
                arrow=${true}
                class="text-white bg-primary"
              >
                <div class="chat-title fw-semibold text-truncate">
                  ${() => agent.thread?.name || "Untitled"}
                </div>
              <//>
            </div>

            <${Show} when=${() => params.threadId}>
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
                    onClick=${(e) => handleDeleteThreadClick(e, params.threadId)}
                    title="Delete chat"
                  >
                    <${Trash2} size="20" color="currentColor" />
                  </button>
                <//>
              </div>
            <//>
          </header>

          <!-- Form / Main Content -->
          <form
            ref=${(el) => (formRef = el)}
            onSubmit=${handleSubmit}
            class="container d-flex flex-column flex-grow-1 mb-3 px-4 position-relative min-w-0"
          >
            <${AlertContainer} alerts=${alerts} onDismiss=${clearAlert} />

            <!-- Messages Area -->
            <div
              class="flex-grow-1 py-3 min-width-0"
              classList=${() => ({ "x-mvh-100": agent.messages?.length > 0 })}
            >
              <${Index} each=${() => agent.messages}>
                ${(message, index) => html`
                  <${Message}
                    message=${message}
                    index=${index}
                    messages=${() => agent.messages}
                    isStreaming=${() => isStreaming}
                    class="small markdown shadow-sm rounded mb-3 p-2 position-relative"
                  />
                `}
              <//>
              <${Show} when=${() => agent.loading}>
                <${Loader}
                  style="display: block; height: 1.1rem; width: 100%; margin: 1rem 0; opacity: 0.5"
                />
              <//>

              <div
                ref=${(el) => {
                  bottomEl = el;
                }}
                style=${() => `scroll-margin-bottom: ${chatHeight()}px`}
              />
            </div>

            <!-- Input Area -->
            <div class=${() => `${hasThreadId() ? "bottom-0 position-sticky" : "bottom-50 position-relative"}`}>
              <!-- Welcome Message -->
              <div class="text-center my-3 font-serif" hidden=${() => hasThreadId()}>
                <h1 class="font-poppins fw-medium fs-2 lh-md text-deep-violet mb-2">
                  Welcome, ${() => user?.()?.firstName || ""}
                </h1>
                <div class="font-inter fw-medium fs-6 lh-md text-black small">
                  How can I help you today?
                </div>
              </div>

              <!-- Scroll to Bottom Button -->
              <${ScrollTo}
                targetRef=${() => bottomEl}
                hidden=${() => isAtBottom() || agent.messages?.length === 0}
                label="Scroll to bottom"
              />

              <div ref=${(el) => { chatRef = el; }}>
                <div class="bg-white position-relative border-gray border-1 border-solid shadow-md rounded">
                  <!-- Attachments Preview -->
                  <${AttachmentsPreview}
                    inputRef=${() => inputFilesEl}
                    onResetRef=${(fn) => (attachmentsReset = fn)}
                  />

                  <!-- Textarea -->
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
                  ></textarea>

                  <!-- Controls Row -->
                  <div class="d-flex justify-content-between pt-1 pb-4 px-4">
                    <!-- Left: Attach + Deep Research Mode -->
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
                        <div class="form-check form-switch form-switch-lg d-flex align-items-center gap-2 my-0 mx-2">
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

                    <!-- Right: Model Selector (admin only) + Clear + Send -->
                    <div class="d-flex w-auto align-items-center gap-2">
                      <${Show} when=${() => user?.()?.Role?.name === "admin"}>
                        <label for="model" class="visually-hidden">Model Selection</label>
                        <select
                          class="model-dropdown form-select form-select-lg fw-semibold fs-6 h-100 border-0 bg-primary-hover cursor-pointer"
                          name="model"
                          id="model"
                          required
                        >
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.OPUS.v4_6}>Opus 4.6</option>
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.SONNET.v4_6} selected>Sonnet 4.5</option>
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.HAIKU.v4_5}>Haiku 4.5</option>
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
                          disabled=${() => agent.loading}
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Privacy Notice -->
                <div class="text-center bg-chat text-muted small py-1">
                  <span class="me-1" title="Your conversations are stored only on your personal device.">
                    To maintain your privacy, we never retain your data on our systems.
                  </span>
                  Please double-check statements, as Research Optimizer can make mistakes.
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}
