import { Show, createEffect, createResource } from "solid-js";
import html from "solid-js/html";
import { getMarked } from "/utils/utils.js";

/**
 * Modal component for displaying a modal dialog
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the modal is open or not
 * @param {function} props.setOpen - Function to set the modal open state
 * @param {string} props.title - Title of the modal (optional)
 * @param {string} props.footer - Footer of the modal (optional)
 * @param {string} props.url - URL to fetch markdown content from
 * @param {function} props.onSubmit - Function to call when the modal is submitted
 * @param {function} props.children - Content of the modal
 * @param {function} props.dialogClass - Style class for the modal body (optional)
 * @param {function} props.bodyClass - Style class for the modal body (optional)
 * @returns
 */
export default function Modal(props) {
  createEffect(() => (document.body.style.overflow = props.open ? "hidden" : "auto"));
  const [innerHTML] = createResource(() => {
    if (!props.url) return Promise.resolve("");
    return fetch(props.url)
      .then((r) => r.text())
      .then((text) => getMarked().parse(text));
  });
  return html`
    <dialog
      class="modal modal-lg border-0 show"
      open=${() => props.open}
      onClose=${() => props.setOpen?.(false)}
      onSubmit=${(e) => props.onSubmit?.(e)}
    >
      <form
        method="dialog"
        class="modal-dialog modal-dialog-scrollable"
        classList=${() => props.dialogClass || ""}
      >
        <div class="modal-content">
          <${Show} when=${props.title}>
            <div class="modal-header">${props.title}</div>
          <//>
          <div class="modal-body" classList=${() => props.bodyClass || ""}>
            <${Show} when=${props.url} fallback=${props.children}>
              <div class="markdown small" innerHTML=${innerHTML} />
            <//>
          </div>
          <${Show} when=${props.footer}>
            <div class="modal-footer">${props.footer}</div>
          <//>
        </div>
      </form>
    </dialog>
  `;
}
