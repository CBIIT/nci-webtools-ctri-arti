// =================================================================================
// CHAT V2 - Full UI (V1 Design) with V2 Logic
// =================================================================================

import { EllipsisVertical, Pencil, Trash2 } from "lucide-solid";
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
} from "solid-js";
import html from "solid-js/html";

import { AlertContainer } from "../../../components/alert.js";
import AttachmentsPreview from "../../../components/attachments-preview.js";
import ClassToggle from "../../../components/class-toggle.js";
import { asFileList } from "../../../components/file-input.js";
import Loader from "../../../components/loader.js";
import ScrollTo from "../../../components/scroll-to.js";
import Tooltip from "../../../components/tooltip.js";
import { useAuthContext } from "../../../contexts/auth-context.js";
import { MODEL_OPTIONS } from "../../../models/model-options.js";
import { alerts, clearAlert, handleError } from "../../../utils/alerts.js";

import DeleteConversation from "./delete-conversation.js";
import {
  EMPTY_CHAT_DRAFT,
  clearChatDraft,
  getChatDraftScope,
  loadChatDraft,
  saveChatDraft,
} from "./draft-store.js";
import { useAgent } from "./hooks.js";
import Message from "./message.js";

const MAX_TITLE_LENGTH = 30;
const STATIC_ADMIN_MODEL_GROUPS = [
  {
    label: "Bedrock",
    options: [
      { value: MODEL_OPTIONS.AWS_BEDROCK.OPUS.v4_6, label: "Opus 4.6" },
      { value: MODEL_OPTIONS.AWS_BEDROCK.SONNET.v4_6, label: "Sonnet 4.6" },
      { value: MODEL_OPTIONS.AWS_BEDROCK.HAIKU.v4_5, label: "Haiku 4.5" },
    ],
  },
  {
    label: "Databricks",
    options: [
      { value: MODEL_OPTIONS.DATABRICKS.CLAUDE.OPUS.v4_6, label: "Opus 4.6 (via IDP)" },
      { value: MODEL_OPTIONS.DATABRICKS.CLAUDE.SONNET.v4_6, label: "Sonnet 4.6 (via IDP)" },
    ],
  },
];
const DEFAULT_ADMIN_MODEL = MODEL_OPTIONS.AWS_BEDROCK.SONNET.v4_6;

function normalizeProviderGroupLabel(providerName) {
  if (providerName === "databricks") {
    return "Databricks";
  }
  if (providerName === "bedrock") {
    return "Bedrock";
  }
  return providerName || "Other";
}

function toAdminModelOption(model) {
  if (!model?.internalName) {
    return null;
  }

  return {
    value: model.internalName,
    label: model.name || model.internalName,
    providerName: model.providerName || null,
  };
}

async function fetchChatModels() {
  try {
    const response = await fetch("/api/v1/model/list?type=chat");
    if (!response.ok) {
      return [];
    }

    const models = await response.json();
    return Array.isArray(models) ? models : [];
  } catch (error) {
    console.warn("Failed to load chat models:", error);
    return [];
  }
}

// =================================================================================
// EXPORTED PAGE COMPONENT (for router)
// =================================================================================

export default function Page() {
  return html`<${ChatApp} />`;
}

// =================================================================================
// INTERNAL CHAT APPLICATION
// =================================================================================

function ChatApp() {
  const { user } = useAuthContext();

  const searchParams = new URLSearchParams(window.location.search);
  const urlParams = Object.fromEntries(searchParams.entries());

  const {
    agent,
    params,
    sendMessage,
    conversations,
    updateConversation,
    deleteConversation,
    generateTitle,
  } = useAgent(urlParams);

  // Fetch available agents for the dropdown
  const fetchAgents = async () => {
    const response = await fetch("/api/v1/agents");
    if (!response.ok) return [];
    return response.json();
  };
  const [agents] = createResource(fetchAgents);
  const [availableModels] = createResource(fetchChatModels);

  // UI State
  const [toggles, setToggles] = createSignal({ conversations: true });
  const [isAtBottom, setIsAtBottom] = createSignal(true);
  const [chatHeight, setChatHeight] = createSignal(0);
  const [deleteConversationId, setDeleteConversationId] = createSignal(null);
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [openMenu, setOpenMenu] = createSignal(null);
  const [editingState, setEditingState] = createSignal({ id: null, context: null, title: "" });
  const [draftMessage, setDraftMessage] = createSignal("");
  const [draftFiles, setDraftFiles] = createSignal([]);
  const [selectedModelId, setSelectedModelId] = createSignal(null);
  const [draftReasoningMode, setDraftReasoningMode] = createSignal(false);

  // Refs
  let titleInputRef;
  let bottomEl;
  let chatRef;
  let inputFilesEl;
  let attachmentsReset;
  let formRef;

  // Computed values
  const hasConversationId = createMemo(() => params.conversationId || agent.conversation?.id);
  const draftScope = createMemo(() =>
    getChatDraftScope(
      params.agentId || agent.id,
      user?.()?.id,
      params.conversationId || agent.conversation?.id || (params.agentId ? "new" : null)
    )
  );
  const adminModelGroups = createMemo(() => {
    const options = [];
    const seen = new Set();

    for (const model of availableModels() || []) {
      const option = toAdminModelOption(model);
      if (!option || seen.has(option.value)) {
        continue;
      }

      seen.add(option.value);
      options.push(option);
    }

    if (options.length === 0) {
      return STATIC_ADMIN_MODEL_GROUPS;
    }

    return Object.values(
      options.reduce((groups, option) => {
        const label = normalizeProviderGroupLabel(option.providerName);
        groups[label] ||= { label, options: [] };
        groups[label].options.push({ value: option.value, label: option.label });
        return groups;
      }, {})
    );
  });
  const selectedAdminModelId = createMemo(() => {
    const activeValue = selectedModelId() || agent.modelId || DEFAULT_ADMIN_MODEL;
    return adminModelGroups().some((group) =>
      group.options.some((option) => option.value === activeValue)
    )
      ? activeValue
      : DEFAULT_ADMIN_MODEL;
  });

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function saveDraftPatch(patch, scope = draftScope()) {
    const nextDraft = {
      message: hasOwn(patch, "message") ? patch.message || "" : draftMessage(),
      modelId: hasOwn(patch, "modelId") ? patch.modelId || null : selectedModelId(),
      files: hasOwn(patch, "files") ? Array.from(patch.files || []).filter(Boolean) : draftFiles(),
      reasoningMode: hasOwn(patch, "reasoningMode")
        ? Boolean(patch.reasoningMode)
        : draftReasoningMode(),
    };

    setDraftMessage(nextDraft.message);
    setSelectedModelId(nextDraft.modelId);
    setDraftFiles(nextDraft.files);
    setDraftReasoningMode(nextDraft.reasoningMode);

    if (!scope) return;
    void saveChatDraft(scope, nextDraft).catch((error) => {
      console.warn("Failed to persist chat draft:", error);
    });
  }

  function handleMessageInput(event) {
    saveDraftPatch({ message: event.currentTarget.value || "" });
  }

  function handleFilesChange(files) {
    saveDraftPatch({ files });
  }

  function handleModelChange(event) {
    saveDraftPatch({ modelId: event.currentTarget.value || null });
  }

  function handleReasoningModeChange(event) {
    saveDraftPatch({ reasoningMode: event.currentTarget.checked });
  }

  // URL sync effect
  createEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (params.agentId) searchParams.set("agentId", params.agentId);
    if (params.conversationId) {
      searchParams.set("conversationId", params.conversationId);
    } else {
      searchParams.delete("conversationId");
    }
    const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
    window.history.replaceState({}, "", newUrl);
  });

  createEffect(async () => {
    const scope = draftScope();
    if (!scope) {
      setDraftMessage(EMPTY_CHAT_DRAFT.message);
      setDraftFiles(EMPTY_CHAT_DRAFT.files);
      setSelectedModelId(EMPTY_CHAT_DRAFT.modelId);
      setDraftReasoningMode(EMPTY_CHAT_DRAFT.reasoningMode);
      return;
    }

    try {
      const draft = await loadChatDraft(scope);
      if (draftScope() !== scope) return;
      setDraftMessage(draft.message);
      setDraftFiles(draft.files);
      setSelectedModelId(draft.modelId);
      setDraftReasoningMode(draft.reasoningMode);
    } catch (error) {
      if (draftScope() !== scope) return;
      console.warn("Failed to load chat draft:", error);
      setDraftMessage(EMPTY_CHAT_DRAFT.message);
      setDraftFiles(EMPTY_CHAT_DRAFT.files);
      setSelectedModelId(EMPTY_CHAT_DRAFT.modelId);
      setDraftReasoningMode(EMPTY_CHAT_DRAFT.reasoningMode);
    }
  });

  createEffect(() => {
    if (!inputFilesEl) return;
    inputFilesEl.files = asFileList(draftFiles());
  });

  // Editing helpers
  const isEditing = (context, conversationId) => {
    const state = editingState();
    return state.context === context && state.id === conversationId;
  };

  const isMenuOpen = (conversationId) => {
    const menu = openMenu();
    return menu?.type === "conversation" && menu?.id === conversationId;
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
    if (agent.loading || isStreaming()) return;

    const form = event.target;
    const text = draftMessage();
    const files = draftFiles();
    const reasoningMode = draftReasoningMode();
    const modelId = user?.()?.Role?.name === "admin" ? selectedAdminModelId() : null;
    const scope = draftScope();

    saveDraftPatch({ message: "", files: [] }, scope);
    if (form.inputFiles) form.inputFiles.value = "";
    attachmentsReset?.({ emit: false });

    const isFirstMessage = agent.messages?.length === 0;
    setIsStreaming(true);

    try {
      await sendMessage(text, files, modelId, reasoningMode);

      // Generate title after first exchange
      if (isFirstMessage) {
        await generateTitle(MODEL_OPTIONS.AWS_BEDROCK.HAIKU.v4_5);
      }
    } catch (error) {
      saveDraftPatch({ message: text, files }, scope);
      handleError(error, "Chat Error");
    } finally {
      setIsStreaming(false);
    }
  }

  function handleDeleteConversationClick(e, conversationId) {
    e.preventDefault();
    setDeleteConversationId(conversationId);
  }

  async function handleDeleteConversation() {
    const id = deleteConversationId();
    if (!id) return;

    await deleteConversation(id);
    await clearChatDraft(getChatDraftScope(params.agentId || agent.id, user?.()?.id, id));
    setDeleteConversationId(null);
  }

  function clearChat() {
    const scope = draftScope();
    saveDraftPatch({ message: "", files: [] }, scope);
    if (!formRef) return;
    if (formRef.inputFiles) formRef.inputFiles.value = "";
    attachmentsReset?.({ emit: false });
  }

  function startEditingTitle(conversationId, currentTitle, context) {
    if (!conversationId) return;
    const rawTitle = currentTitle?.trim()?.length > 0 ? currentTitle : "Untitled";
    const title = rawTitle.slice(0, MAX_TITLE_LENGTH);
    setEditingState({ id: conversationId, context, title });
    setOpenMenu(null);
  }

  async function handleTitleKeyDown(event, conversationId) {
    if (event.key !== "Enter" && event.key !== "Escape") return;
    event.preventDefault();
    if (event.key === "Enter") {
      onTitleSubmit(conversationId);
      return;
    }
    stopEditingTitle();
  }

  async function onTitleSubmit(conversationId) {
    const { title } = editingState() || {};
    const newTitle = title?.trim() || "";

    if (!newTitle || !conversationId) {
      stopEditingTitle();
      return;
    }

    try {
      await updateConversation(conversationId, { name: newTitle });
    } finally {
      stopEditingTitle();
    }
  }

  function handleConversationMenuToggle(event, conversationId) {
    event.preventDefault();
    event.stopPropagation();
    setOpenMenu((prev) =>
      prev?.type === "conversation" && prev?.id === conversationId
        ? null
        : { type: "conversation", id: conversationId }
    );
  }

  function handleConversationMenuEdit(event, conversation) {
    event.preventDefault();
    event.stopPropagation();
    startEditingTitle(conversation.id, conversation.name, "sidebar");
  }

  function handleConversationMenuDelete(event, conversationId) {
    event.preventDefault();
    event.stopPropagation();
    setOpenMenu(null);
    handleDeleteConversationClick(event, conversationId);
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

            <!-- New Chat Button -->
            <div
              class="d-flex align-items-center gap-2 link-primary text-decoration-none mb-3 fw-semibold"
              title="New Chat"
            >
              <a
                href=${() => `/tools/chat-v2?agentId=${params.agentId || 1}`}
                target="_self"
                class="btn btn-sm btn-primary d-flex-center rounded-5 wh-2 p-0"
              >
                <img src="assets/images/icon-plus.svg" alt="New Chat" width="16" />
              </a>
              <${Show} when=${() => toggles().conversations}>
                <${ClassToggle} class="dropdown d-flex-center" activeClass="show" event="hover">
                  <a
                    toggle
                    href=${() => `/tools/chat-v2?agentId=${params.agentId || 1}`}
                    target="_self"
                    class="btn btn-sm p-0 dropdown-toggle"
                  >
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
                            >${() => agentItem.name}</a
                          >
                        </li>
                      `}
                    <//>
                  </ul>
                <//>
              <//>
            </div>

            <!-- Conversation List -->
            <${Show} when=${() => toggles().conversations}>
              <small class="mb-2 fw-normal text-muted fs-6">Recent Chats</small>

              <ul class="list-unstyled">
                <${For} each=${conversations}>
                  ${(conversation) => {
                    const href = `/tools/chat-v2?agentId=${params.agentId || 1}&conversationId=${conversation.id}`;
                    return html`<li class="convo-item small w-100 mb-2">
                      <a
                        href=${href}
                        target="_self"
                        class="convo-hitbox d-flex align-items-center px-3 py-2 text-decoration-none"
                      >
                        <div
                          class="convo-title text-primary fw-normal text-truncate flex-grow-1 min-w-0"
                          classList=${() => ({ active: conversation.id === params.conversationId })}
                        >
                          <${Show}
                            when=${() => isEditing("sidebar", conversation.id)}
                            fallback=${() => conversation.name || "Untitled"}
                          >
                            <input
                              type="text"
                              class="form-control form-control-sm bg-transparent border-0 shadow-none px-0 py-0 text-primary fw-normal"
                              value=${() => editingState().title}
                              maxlength=${MAX_TITLE_LENGTH}
                              onInput=${(event) =>
                                updateEditingTitle(event.currentTarget.value || "")}
                              onKeyDown=${(event) => handleTitleKeyDown(event, conversation.id)}
                              onBlur=${() => stopEditingTitle()}
                              onClick=${(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              ref=${attachAndFocusTitleInput}
                            />
                          <//>
                        </div>

                        <${Show} when=${() => !isEditing("sidebar", conversation.id)}>
                          <div class="dropdown ms-2 position-relative">
                            <button
                              type="button"
                              class="action-btn btn btn-sm link-dark text-primary p-1 border-0 rounded-pill"
                              aria-label="Chat options"
                              title="Chat options"
                              onClick=${(event) =>
                                handleConversationMenuToggle(event, conversation.id)}
                            >
                              <${EllipsisVertical} size="18" color="currentColor" />
                            </button>
                            <ul
                              class="dropdown-menu mt-1 show"
                              hidden=${() => !isMenuOpen(conversation.id)}
                              onClick=${(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                            >
                              <li>
                                <button
                                  type="button"
                                  class="dropdown-item small d-flex align-items-center"
                                  onClick=${(event) =>
                                    handleConversationMenuEdit(event, conversation)}
                                >
                                  <${Pencil} size="18" color="black" class="me-2" />
                                  Edit title
                                </button>
                              </li>
                              <li>
                                <button
                                  type="button"
                                  class="dropdown-item small text-danger d-flex align-items-center"
                                  onClick=${(event) =>
                                    handleConversationMenuDelete(event, conversation.id)}
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
            <${Show} when=${() => deleteConversationId()}>
              <${DeleteConversation}
                conversationId=${() => deleteConversationId()}
                onClose=${() => setDeleteConversationId(null)}
                onDelete=${handleDeleteConversation}
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
                title=${() => agent.conversation?.name || "Untitled"}
                placement="bottom"
                arrow=${true}
                class="text-white bg-primary"
              >
                <div class="chat-title fw-semibold text-truncate">
                  ${() => agent.conversation?.name || "Untitled"}
                </div>
              <//>
            </div>

            <${Show} when=${() => params.conversationId}>
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
                    onClick=${(e) => handleDeleteConversationClick(e, params.conversationId)}
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
                    isStreaming=${isStreaming}
                    class="small markdown shadow-sm rounded mb-3 p-2 position-relative"
                  />
                `}
              <//>
              <${Show} when=${() => agent.loading}>
                <${Loader}
                  style="display: block; height: 1.1rem; width: 100%; margin: 1rem 0; opacity: 0.5"
                />
                <${Show} when=${() => agent.summarizing}>
                  <div class="text-muted small text-center" style="margin-top: -0.5rem">
                    Summarizing…
                  </div>
                <//>
              <//>

              <div
                ref=${(el) => {
                  bottomEl = el;
                }}
                style=${() => `scroll-margin-bottom: ${chatHeight()}px`}
              />
            </div>

            <!-- Input Area -->
            <div
              class=${() =>
                `${hasConversationId() ? "bottom-0 position-sticky" : "bottom-50 position-relative"}`}
            >
              <!-- Welcome Message -->
              <div class="text-center my-3 font-serif" hidden=${() => hasConversationId()}>
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

              <div
                ref=${(el) => {
                  chatRef = el;
                }}
              >
                <div
                  class="bg-white position-relative border-gray border-1 border-solid shadow-md rounded"
                >
                  <!-- Attachments Preview -->
                  <${AttachmentsPreview}
                    files=${draftFiles}
                    onFilesChange=${handleFilesChange}
                    inputRef=${() => inputFilesEl}
                    onResetRef=${(fn) => (attachmentsReset = fn)}
                  />

                  <!-- Textarea -->
                  <label for="message" class="visually-hidden">Chat Message</label>
                  <textarea
                    onKeyDown=${handleKeyDown}
                    onInput=${handleMessageInput}
                    class="form-control form-control-sm font-inter fw-normal fs-6 lh-md text-black resize-none border-0 bg-transparent shadow-0 p-3 pt-4 px-4"
                    id="message"
                    name="message"
                    value=${draftMessage}
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
                        <div
                          class="form-check form-switch form-switch-lg d-flex align-items-center gap-2 my-0 mx-2"
                        >
                          <input
                            class="form-check-input form-check-input-lg mt-0 cursor-pointer"
                            type="checkbox"
                            id="reasoningMode"
                            name="reasoningMode"
                            checked=${draftReasoningMode}
                            onInput=${handleReasoningModeChange}
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

                    <!-- Right: Admin override selector + Clear + Send -->
                    <div class="d-flex w-auto align-items-center gap-2">
                      <${Show} when=${() => user?.()?.Role?.name === "admin"}>
                        <div class="d-flex flex-column align-items-start gap-1">
                          <select
                            class="model-dropdown form-select form-select-lg fw-semibold fs-6 h-100 border-0 bg-primary-hover cursor-pointer"
                            name="model"
                            id="model"
                            value=${selectedAdminModelId}
                            title="Admin only. Leave this at the saved agent model unless you intentionally need an override."
                            aria-label="Admin model override"
                            onInput=${handleModelChange}
                            required
                          >
                            <${For} each=${adminModelGroups()}>
                              ${(group) => html`
                                <optgroup label=${group.label}>
                                  <${For} each=${group.options}>
                                    ${(option) => html`
                                      <option
                                        value=${option.value}
                                        selected=${() => selectedAdminModelId() === option.value}
                                      >
                                        ${option.label}
                                      </option>
                                    `}
                                  <//>
                                </optgroup>
                              `}
                            <//>
                          </select>
                        </div>
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
                  Please double-check statements. AI is not always right, even when it sounds
                  confident.
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}
