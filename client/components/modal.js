import { Show, createEffect, createResource } from "solid-js";
import html from "solid-js/html";
import { getMarked } from "../utils/utils.js";

/**
 * Modal component for displaying a modal dialog
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the modal is open or not
 * @param {function} props.setOpen - Function to set the modal open state
 * @param {string} props.title - Title of the modal
 * @param {string} props.url - URL to fetch markdown content from
 * @param {function} props.onSubmit - Function to call when the modal is submitted
 * @param {function} props.children - Content of the modal
 * @returns 
 */
export default function Modal(props) {
  createEffect(() => (document.body.style.overflow = props.open ? "hidden" : "auto"));
  const [innerHTML] = createResource(() => fetch(props.url).then(r => r.text()).then(getMarked().parse));
  return html`
    <dialog class="modal border-0 show" open=${props.open} onClose=${(e) => props.setOpen?.(false)} onSubmit=${props.onSubmit}>
      <form method="dialog" class="modal-dialog modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">${props.title}</div>
          <div class="modal-body">
            <${Show} when=${props.url} fallback=${props.children}>
              <div class="markdown small" innerHTML=${innerHTML} />
            <//>
          </div>
        </div>
      </form>
    </dialog>
  `;
}