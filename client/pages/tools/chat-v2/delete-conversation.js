// =================================================================================
// DELETE-CONVERSATION.JS - Delete Thread Confirmation Modal
// Copied from V1, adapted for V2's thread terminology
// =================================================================================

import { createSignal, onCleanup, onMount } from "solid-js";
import html from "solid-js/html";

import { X } from "lucide-solid";

export default function DeleteConversation(props) {
  const [dialog, setDialog] = createSignal(null);

  function closeDialog() {
    dialog()?.close();
    props.onClose && props.onClose();
  }

  onMount(() => {
    const el = dialog();
    if (!el) {
      return;
    }

    el.addEventListener("close", closeDialog);

    if (typeof el.showModal === "function") {
      try {
        el.showModal();
      } catch (e) {
        console.error("Failed to show modal.", e);
      }
    } else {
      el.open = true;
    }

    queueMicrotask(() => el.focus({ preventScroll: true }));

    onCleanup(() => {
      el.removeEventListener("close", closeDialog);
    });
  });

  async function onSubmit(event) {
    event.preventDefault();
    typeof props.onDelete === "function" && props.onDelete();
    closeDialog();
  }

  return html`<dialog
    ref=${(el) => setDialog(el)}
    class="z-3 border-0 rounded-3 shadow-lg p-0 bg-white"
    style="width: min(520px, calc(100vw - 2rem));"
    aria-labelledby="delete-conversation-title"
  >
    <div class="d-flex flex-column">
      <div class="d-flex align-items-center justify-content-between p-4">
        <h2 id="delete-conversation-title" class="h5 fw-semibold mb-0">Delete Chat</h2>
        <button
          type="reset"
          class="close-btn btn btn-sm d-inline-flex align-items-center justify-content-center rounded focus-ring"
          aria-label="Close"
          onClick=${() => closeDialog()}
        >
          <${X} size="18" />
        </button>
      </div>

      <div class="pb-3 px-4 d-grid gap-3">
        This will delete this chat. Are you sure you want to proceed?
      </div>

      <div class="d-flex justify-content-end gap-2 p-4">
        <button type="reset" class="btn btn-light border" onClick=${() => closeDialog()}>
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" onClick=${onSubmit}>Delete</button>
      </div>
    </div>
  </dialog>`;
}
