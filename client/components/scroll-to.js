import { splitProps } from "solid-js";
import html from "solid-js/html";

/**
 * Scrolls the target element into view.
 *
 * @param {object} props
 * @param {string} props.label - The label for the button
 * @param {boolean} props.hidden - Whether the button should be hidden
 * @param {function} props.targetRef - A ref to the target element to scroll to
 * @returns ScrollTo component
 */
export default function ScrollTo(props) {
  function scrollToElement() {
    if (!props.targetRef) {
      return;
    }

    requestAnimationFrame(() => {
      props.targetRef.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }

  return html`<div
    class="d-flex justify-content-center align-items-center pb-3"
    classList=${() => ({ "d-none": props.hidden })}
  >
    <button
      type="button"
      onClick=${scrollToElement}
      class="btn btn-primary d-flex justify-content-center align-items-center text-nowrap fw-semibold pe-auto gap-2 rounded-pill px-[12px] ps-3 fs-08 focus-ring text-white"
    >
      <span class="pb-0">${props.label}</span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="w-1r h-1r"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  </div>`;
}

