import { ArrowDown } from "lucide-solid";
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
    const target = typeof props.targetRef === "function" ? props.targetRef() : props.targetRef;
    if (!target) {
      return;
    }

    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "end" });
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
      aria-label=${() => props.label || "Scroll to bottom"}
    >
      <span class="visually-hidden">${() => props.label || "Scroll to bottom"}</span>
      <${ArrowDown} size="20" color="black" />
    </button>
  </div>`;
}
