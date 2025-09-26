import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import html from "solid-js/html";

import { File as FileIcon, X } from "lucide-solid";

import { attachmentFileTypes } from "../configs/attachment-file-types.js";

/**
 * AttachmentsPreview component displays a preview of uploaded attachments.
 *
 * @param {*} props - Component props.
 * @param props.onNamesChange - Callback function triggered when attachment names change.
 * @param props.inputRef - The input element reference.
 * @param props.onReject - Callback function triggered when a file is rejected.
 * @param props.onResetRef - Callback function triggered when the attachments are reset.
 * @returns {JSX.Element}
 */
export default function AttachmentsPreview(props) {
  const [attachments, setAttachments] = createSignal([]);
  const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
  let detach = null;

  const getType = (mime, ext) => {
    ext = (ext || "").toLowerCase();

    for (const [k, v] of Object.entries(attachmentFileTypes)) {
      if (v.extension.includes(ext) || v.mime.includes(mime)) {
        return k;
      }
    }

    return "other";
  };

  const getIconFor = (k) => attachmentFileTypes[k]?.icon || FileIcon;

  const buildAttachment = (file) => {
    const name = file.name || "untitled";
    const ext = (name.includes(".") ? name.split(".").pop() : "") || "";
    const mime = file.type || "";
    const type = getType(mime, ext);
    const isImage = type === "image";
    const url = isImage ? URL.createObjectURL(file) : null;
    return {
      id: crypto.randomUUID(),
      file,
      name,
      ext,
      mime,
      type,
      typeLabel: attachmentFileTypes[type]?.label || "File",
      isImage,
      url,
    };
  };

  const revokeAll = (list) => list.forEach((a) => a.url && URL.revokeObjectURL(a.url));

  const emitNames = (list) => props.onNamesChange && props.onNamesChange(list.map((a) => a.name));

  const syncFromInput = () => {
    const el = typeof props.inputRef === "function" ? props.inputRef() : props.inputRef;
    if (!el) {
      return;
    }

    const files = Array.from(el.files || []);
    const allowed = [];
    const rejected = [];

    for (const f of files) {
      const arr = f.size <= MAX_BYTES ? allowed : rejected;
      arr.push(f);
    }

    // If any are rejected, rebuild the FileList with only allowed
    if (rejected.length) {
      const dataTransfer = new DataTransfer();
      allowed.forEach((f) => dataTransfer.items.add(f));
      el.files = dataTransfer.files;

      props.onReject && props.onReject(rejected);

      try {
        const names = rejected.map((f) => f.name).join(", ");
        el.setCustomValidity(`The following file(s) exceed 5 MB: ${names}`);
        el.reportValidity();
        setTimeout(() => el.setCustomValidity(""), 10000);
      } catch (_) {
        // ignore if not supported
      }
    }

    revokeAll(attachments());
    const list = allowed.map(buildAttachment);
    setAttachments(list);
    emitNames(list);
  };

  const removeAttachment = (id) => {
    const el = typeof props.inputRef === "function" ? props.inputRef() : props.inputRef;
    if (!el) {
      return;
    }

    const current = attachments();
    const next = current.filter((a) => a.id !== id);

    const dataTransfer = new DataTransfer();
    next.forEach((a) => dataTransfer.items.add(a.file));
    el.files = dataTransfer.files;

    const removed = current.find((a) => a.id === id);
    if (removed?.url) {
      URL.revokeObjectURL(removed.url);
    }

    setAttachments(next);
    emitNames(next);
  };

  const reset = () => {
    revokeAll(attachments());
    setAttachments([]);
    emitNames([]);
  };

  onMount(() => {
    props.onResetRef && props.onResetRef(reset);

    const el = typeof props.inputRef === "function" ? props.inputRef() : props.inputRef;
    if (!el) {
      return;
    }

    const handler = () => syncFromInput();
    el.addEventListener("change", handler);
    detach = () => el.removeEventListener("change", handler);

    syncFromInput();
  });

  onCleanup(() => {
    detach && detach();
    reset();
  });

  return html`
    <${Show} when=${() => attachments().length > 0}>
      <div class="p-2 mb-2 text-body">
        <div class="d-flex flex-wrap gap-2" style="max-height: 220px; overflow-y: auto;">
          <${For} each=${() => attachments()}>
            ${(att) => {
              const Icon = getIconFor(att.type);
              return html`
                <div
                  class="position-relative border rounded p-2 d-flex align-items-start gap-2"
                  style="min-width: 240px; max-width: 240px;"
                >
                  <button
                    type="button"
                    class="btn-unstyled position-absolute top-0 end-0 p-1 text-body"
                    aria-label=${`Remove ${att.name}`}
                    title="Remove"
                    onClick=${() => removeAttachment(att.id)}
                  >
                    <${X} size="16" color="currentColor" />
                  </button>

                  <div
                    class="rounded d-flex-center overflow-hidden bg-body-tertiary"
                    style="width: 48px; height: 48px; flex: 0 0 48px;"
                  >
                    <${Show}
                      when=${att.isImage}
                      fallback=${html`<${Icon} size="24" color="currentColor" />`}
                    >
                      <img
                        src=${att.url}
                        alt=${`Preview of ${att.name}`}
                        style="object-fit: cover; width: 100%; height: 100%;"
                      />
                    <//>
                  </div>

                  <div class="min-w-0" style="max-width: 155px">
                    <div class="fw-semibold text-truncate" title=${att.name}>${att.name}</div>
                    <div class="small text-muted text-truncate">${att.typeLabel}</div>
                  </div>
                </div>
              `;
            }}
          <//>
        </div>
      </div>
    <//>
  `;
}
