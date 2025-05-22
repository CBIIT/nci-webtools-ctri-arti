import { createEffect } from "solid-js";
import html from "solid-js/html";

/**
 * Modal component for displaying a modal dialog
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the modal is open or not
 * @param {function} props.setOpen - Function to set the modal open state
 * @param {string} props.title - Title of the modal
 * @param {function} props.onClose - Function to call when the modal is closed
 * @param {function} props.onSubmit - Function to call when the modal is submitted
 * @param {function} props.children - Content of the modal
 * @returns 
 */
export default function Modal(props) {
  createEffect(() => (document.body.style.overflow = props.open() ? "hidden" : "auto"));
  return html`
    <dialog class="modal border-0 show" open=${props.open} onClose=${(e) => props.setOpen(false)} onSubmit=${props.onSubmit}>
      <form method="dialog" class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h1 class="modal-title fs-5">${props.title}</h1>
            <button type="submit" class="btn-close" aria-label="Close"></button>
          </div>
          <div class="modal-body">${props.children}</div>
          <div class="modal-footer">
            <button type="submit" class="btn btn-primary">Continue</button>
          </div>
      </form>
    </dialog>
  `;
}