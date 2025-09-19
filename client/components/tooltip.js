import { createEffect, createMemo, createSignal, mergeProps, onCleanup, onMount } from "solid-js";
import html from "solid-js/html";
import { Portal } from "solid-js/web";

/** Get or create a single floating root attached to <body> */
function getFloatRoot() {
  const ID = "ui-floats-root";
  let el = document.getElementById(ID);
  if (!el) {
    el = document.createElement("div");
    el.id = ID;
    el.className = "ui-floats"; // styled below
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Tooltip component
 *
 * @param {object} props
 * @param {string|Node|Function} props.title
 * @param {"top" | "bottom" | "left" | "right"} [props.placement='top']
 * @param {boolean} [props.arrow=false]
 * @param {boolean} [props.disableHoverListener=false]
 * @param {boolean} [props.open]
 * @param {number} [props.enterDelay=100]
 * @param {number} [props.leaveDelay=100]
 * @param {number} [props.offset]
 * @param {string} [props.wrapperClass]
 * @param {string} [props.id]
 * @param {(e: Event) => void} [props.onClick]
 * @param {any} props.children
 */
export default function Tooltip(rawProps) {
  const props = mergeProps(
    {
      placement: "top",
      arrow: false,
      disableHoverListener: false,
      enterDelay: 100,
      leaveDelay: 100,
      offset: undefined,
      id: undefined,
      wrapperClass: "",
    },
    rawProps
  );

  const [internalOpen, setInternalOpen] = createSignal(false);
  const isControlled = () => typeof props.open === "boolean";
  const isOpen = createMemo(() => (isControlled() ? !!props.open : internalOpen()));

  let triggerEl = null;
  let tooltipEl = null;
  let enterTimer, leaveTimer;

  let popper = null;
  let resizeObserver = null;

  const effectiveOffset = createMemo(() =>
    typeof props.offset === "number" ? props.offset : props.arrow ? 8 : 6
  );

  const titleValue = createMemo(() =>
    typeof props.title === "function" ? props.title() : props.title
  );

  const tooltipId = props.id || `tt-${crypto.randomUUID()}`;

  const show = () => {
    if (isControlled()) return;
    clearTimeout(leaveTimer);
    enterTimer = window.setTimeout(() => setInternalOpen(true), props.enterDelay);
  };
  const hide = () => {
    if (isControlled()) return;
    clearTimeout(enterTimer);
    leaveTimer = window.setTimeout(() => setInternalOpen(false), props.leaveDelay);
  };

  const onMouseEnter = () => !props.disableHoverListener && show();
  const onMouseLeave = () => !props.disableHoverListener && hide();
  const onFocus = () => !props.disableHoverListener && show();
  const onBlur = () => !props.disableHoverListener && hide();
  const onClick = (e) => props.onClick?.(e);
  const onKeyDown = (e) => {
    if (e.key === "Escape" && !isControlled()) setInternalOpen(false);
  };

  const updateModifiers = (mods = []) =>
    (mods || []).map((m) => {
      if (m.name === "offset") return { ...m, options: { offset: [0, effectiveOffset()] } };
      if (m.name === "arrow") return { ...m, enabled: !!props.arrow };
      return m;
    });

  onMount(() => {
    const PopperCore = window.Popper;
    if (!PopperCore?.createPopper) {
      console.warn(
        "[Tooltip] Popper not found. Include Bootstrap bundle (with Popper) or @popperjs/core."
      );
      return;
    }

    popper = PopperCore.createPopper(triggerEl, tooltipEl, {
      placement: props.placement,
      /** KEY CHANGE: prevent scroll-height inflation */
      strategy: "fixed",
      modifiers: [
        { name: "offset", options: { offset: [0, effectiveOffset()] } },
        { name: "flip", options: { fallbackPlacements: ["top", "right", "bottom", "left"] } },
        { name: "preventOverflow", options: { padding: 8, boundary: "viewport" } },
        { name: "arrow", enabled: !!props.arrow },
        { name: "eventListeners", enabled: false },
      ],
    });

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => popper?.update());
      tooltipEl && resizeObserver.observe(tooltipEl);
    }
  });

  createEffect(() => {
    // Reposition when content changes and tooltip is shown
    titleValue();
    if (popper && isOpen()) popper.update();
  });

  createEffect(() => {
    if (!popper) return;
    popper.setOptions((opts) => ({
      ...opts,
      placement: props.placement,
      strategy: "fixed", // keep fixed on updates
      modifiers: updateModifiers(opts.modifiers),
    }));
    if (isOpen()) popper.update();
  });

  createEffect(() => {
    if (!popper) return;
    const open = isOpen();
    popper.setOptions((opts) => ({
      ...opts,
      modifiers: [
        ...(opts.modifiers || []).filter((m) => m.name !== "eventListeners"),
        { name: "eventListeners", enabled: open },
      ],
    }));
    if (open) popper.update();
  });

  onCleanup(() => {
    clearTimeout(enterTimer);
    clearTimeout(leaveTimer);
    resizeObserver?.disconnect?.();
    popper?.destroy?.();
    popper = null;
  });

  return html`
    <span
      ref=${(el) => (triggerEl = el)}
      class=${`s-tooltip-wrapper ${props.wrapperClass || ""}`}
      aria-describedby=${() => (isOpen() ? tooltipId : undefined)}
      onMouseEnter=${onMouseEnter}
      onMouseLeave=${onMouseLeave}
      onFocus=${onFocus}
      onBlur=${onBlur}
      onClick=${onClick}
      onKeyDown=${onKeyDown}
      style="display:inline-flex;align-items:center;"
    >
      ${props.children}

      <${Portal} mount=${getFloatRoot()}>
        <div
          ref=${(el) => (tooltipEl = el)}
          id=${tooltipId}
          role="tooltip"
          class=${`s-tooltip ${props.class ?? ""}`}
          data-show=${() => (isOpen() ? "" : undefined)}
          data-popper-placement=${props.placement}
          aria-hidden=${() => (!isOpen()).toString()}
        >
          <div class="s-tooltip-inner">
            <div class="s-tooltip-content">
              ${() => (typeof props.title === "function" ? props.title() : props.title)}
            </div>
          </div>
          ${() =>
            props.arrow ? html`<div class="s-tooltip-arrow" data-popper-arrow></div>` : null}
        </div>
      <//>
    </span>
  `;
}
