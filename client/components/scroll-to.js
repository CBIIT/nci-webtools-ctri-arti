import html from "solid-js/html";

import { ArrowDown } from "lucide-solid";

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
      class="scroll-down-btn bg-white rounded-full d-flex justify-content-center align-items-center focus-ring shadow-lg"
    >
      <${ArrowDown} size="20" color="black" />
    </button>
  </div>`;
}
