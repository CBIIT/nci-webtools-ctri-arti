import { children, onCleanup, onMount } from "solid-js";
import html from "solid-js/html";

/**
 * Toggles classes on child elements based on click or hover events.
 * The component expects children with a `toggle` attribute to act as the trigger.
 * Other children will have the active class toggled (default is "show").
 * @param {*} props - Component props
 * @param {boolean} props.disabled - When true, disables toggle functionality
 * @param {string} props.activeClass - Class to toggle (default: "show")
 * @param {string} props.event - Event type: "click" (default) or "hover"
 * @param {string} props.class - CSS class for the container
 * @returns
 */
export default function ClassToggle(props) {
  let el = null;
  const resolved = children(() => props.children);
  const content = resolved().filter((child) => !child.hasAttribute?.("toggle"));
  const toggle = () => !props.disabled && content.forEach((c) => c.classList.toggle(props.activeClass || "show"));
  const hide = () => !props.disabled && content.forEach((c) => c.classList.remove(props.activeClass || "show"));
  const onMouseOver = () => props.event === "hover" && toggle();
  const onMouseOut = () => props.event === "hover" && hide();
  const onClickOutside = (event) => !el?.contains(event.target) && hide();
  onMount(() => document.addEventListener("click", onClickOutside, true));
  onCleanup(() => document.removeEventListener("click", onClickOutside, true));
  return html`
    <div
      ref=${(ref) => (el = ref)}
      class=${props.class}
      onClick=${toggle}
      onMouseOver=${onMouseOver}
      onMouseOut=${onMouseOut}
    >
      ${resolved}
    </div>
  `;
}
