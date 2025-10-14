import { Show, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import html from "solid-js/html";
import { computePosition, autoUpdate, arrow, flip, shift, offset } from "@floating-ui/dom";

/**
 * Floating element component using Floating UI (successor to Popper.js)
 * This is a basis for tooltips, dropdowns, popovers, etc.
 * 
 * @param {any} props - object with reactive getters for the following properties (don't destructure):
 * @param {string} props.class - CSS class for the floating element
 * @param {string} props.arrowClass - CSS class for the arrow element
 * @param {any} props.content - Content of the floating element (string or element)
 * @param {"top" | "bottom" | "left" | "right"} [props.placement='top'] - Placement of the floating element
 * @param {"click" | "hover"} [props.trigger='hover'] - Trigger event to show/hide the floating element
 * @param {any} props.children - Element that triggers the floating element
 * @param {Array} [props.middleware] - Floating UI middleware (default: [flip(), shift(), offset(6), arrow()])
 * @param {number} [props.offset] - Offset distance for the floating element (default: 6)
 * @returns {any} Floating element component
 */
export default function Float(props) {
  const [targetRef, setTargetRef] = createSignal(null);
  const [floatingRef, setFloatingRef] = createSignal(null);
  const [arrowRef, setArrowRef] = createSignal(null);
  const [position, setPosition] = createSignal({ x: 0, y: 0 });
  const [active, setActive] = createSignal(false);
  const toggleActive = () => setActive((a) => !a);
  const onMouseOut = () => props.trigger === "hover" && setActive(false);
  const onMouseOver = () => props.trigger === "hover" && setActive(true);
  const onClickOutside = (event) => !floatingRef()?.contains?.(event.target) && setActive(false);
  onMount(() => document.addEventListener("click", onClickOutside, true));
  onCleanup(() => document.removeEventListener("click", onClickOutside, true));

  createEffect(() => {
    const targetEl = targetRef();
    const floatingEl = floatingRef();
    const arrowEl = arrowRef();
    if (!targetEl || !floatingEl) return;
    const placement = props.placement || "top";
    const middleware = props.middleware || [
      flip(),
      shift(),
      offset(props.offset || 6),
      arrow({ element: arrowEl }),
    ];
    const options = { placement, middleware };
    const update = async () => setPosition(await computePosition(targetEl, floatingEl, options));
    const cleanup = autoUpdate(targetEl, floatingEl, update);
    onCleanup(cleanup);
  });

  return html`
    <span
      ref=${setTargetRef}
      onClick=${toggleActive}
      onMouseOut=${onMouseOut}
      onMouseOver=${onMouseOver}
    >
      ${props.children}
    </span>
    <${Portal}>
      <${Show} when=${active}>
        <output
          ref=${setFloatingRef}
          class=${props.class}
          style=${() => ({
            position: "absolute",
            left: position().x + "px",
            top: position().y + "px",
            "z-index": 1000,
          })}
        >
          <div
            ref=${setArrowRef}
            class=${props.arrowClass}
            style=${() => ({
              position: "absolute",
              left: position().middlewareData?.arrow?.x + "px",
              top: position().middlewareData?.arrow?.y + "px",
              "z-index": 1000,
            })}
          ></div>
          ${props.content}
        </output>
      <//>
    <//>
  `;
}

/**
 * Bootstrap tooltip component using Float
 * @param {any} props - object with reactive getters for the following properties (don't destructure):
 * @param {string} props.title - Tooltip content (string or element)
 * @param {string} props.placement - Tooltip placement: "top" (default), "right", "bottom", "left"
 * @param {string} props.trigger - Trigger event: "hover" (default) or "click"
 * @param {any} props.children - Element that triggers the tooltip
 * @returns {any} Tooltip component wrapped around children
 */
export function Tooltip(props) {
  const placementClass =
    {
      left: "bs-tooltip-start",
      right: "bs-tooltip-end",
      top: "bs-tooltip-top",
      bottom: "bs-tooltip-bottom",
    }[props.placement] || "bs-tooltip-top";
  return html`
    <${Float}
      arrowClass="tooltip-arrow"
      class=${() => `show fade tooltip bs-tooltip-auto ${placementClass}`}
      content=${() => html`<div class="tooltip-inner">${props.title}</div>`}
      placement=${() => props.placement || "top"}
      trigger=${() => props.trigger || "hover"}
    >
      ${props.children}
    <//>
  `;
}

/**
 * Bootstrap popover component using Float
 * @param {any} props - object with reactive getters for the following properties (don't destructure):
 * @param {string} props.title - Popover title (string or element)
 * @param {string} props.content - Popover content (string or element)
 * @param {string} props.placement - Popover placement: "top" (default), "right", "bottom", "left"
 * @param {string} props.trigger - Trigger event: "click" (default) or "hover"
 * @param {any} props.children - Element that triggers the popover
 * @returns 
 */
export function Popover(props) {
  const placementClass =
    {
      left: "bs-popover-start",
      right: "bs-popover-end",
      top: "bs-popover-top",
      bottom: "bs-popover-bottom",
    }[props.placement] || "bs-popover-top";
  return html`
    <${Float}
      arrowClass="popover-arrow"
      class=${() => `show fade popover bs-popover-auto ${placementClass}`}
      content=${() => html`
        <div class="popover-header">${props.title}</div>
        <div class="popover-body">${props.content}</div>
      `}
      placement=${() => props.placement || "top"}
      trigger=${() => props.trigger || "click"}
    >
      ${props.children}
    <//>
  `;  
}