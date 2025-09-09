import { createEffect, createMemo, createSignal, mergeProps, onCleanup, onMount } from "solid-js";
import html from "solid-js/html";
import { Portal } from "solid-js/web";

/**
 * Tooltip component
 *
 * @param {object} props - Component properties
 * @param {string|Node} props.title - Text or DOM Node to render inside the tooltip.
 * @param {"top" | "bottom" | "left" | "right"} [props.placement='top'] - Preferred placement of the tooltip.
 * @param {boolean} [props.arrow=false] - Whether to render an arrow pointing to the trigger.
 * @param {boolean} [props.disableHoverListener=false] - If true, disables hover/focus show/hide behavior.
 * @param {boolean} props.open - Controlled open state; when provided the component is controlled.
 * @param {number} [props.enterDelay=100] - Milliseconds to wait before showing on hover/focus.
 * @param {number} [props.leaveDelay=100] - Milliseconds to wait before hiding on blur/mouseleave.
 * @param {number} props.offset - Pixel offset between trigger and tooltip; defaults depend on `arrow`.
 * @param {string} props.wrapperClass - Additional class name(s) applied to the trigger wrapper.
 * @param {string} props.id - ID for the tooltip element (used for aria-describedby).
 * @param {(e: Event) => void} props.onClick - Optional click handler forwarded from the trigger wrapper.
 * @param {any} props.children - The trigger element(s) wrapped by the tooltip.
 * @returns {any} Rendered tooltip output (framework-specific)
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
  /**
   * Reference to the trigger element
   */
  let triggerEl = null;
  /**
   * Reference to the tooltip element
   */
  let tooltipEl = null;

  /**
   * Whether the tooltip is currently open
   */
  const isOpen = createMemo(() => (isControlled() ? !!props.open : internalOpen()));

  /**
   * Effective offset between trigger and tooltip
   */
  const effectiveOffset = createMemo(() =>
    typeof props.offset === "number" ? props.offset : props.arrow ? 8 : 6
  );

  /**
   * Memoized value for the tooltip title
   */
  const titleValue = createMemo(() =>
    typeof props.title === "function" ? props.title() : props.title
  );

  /**
   * Unique ID for the tooltip element
   */
  const tooltipId = props.id || `tt-${Math.random().toString(36).slice(2, 8)}`;

  /**
   * Timer for enter delay
   */
  let enterTimer = undefined;
  /**
   * Timer for leave delay
   */
  let leaveTimer = undefined;

  /**
   * Popper instance
   */
  let popper = null;

  /**
   * Resize observer to detect content size changes and trigger popper update
   */
  let resizeObserver = null;

  /**
   * Show the tooltip when the trigger is hovered or focused
   *
   * @returns {void}
   */
  const show = () => {
    if (isControlled()) {
      return;
    }

    clearTimeout(leaveTimer);
    enterTimer = window.setTimeout(() => {
      setInternalOpen(true);
    }, props.enterDelay);
  };

  /**
   * Hide the tooltip when the trigger is no longer hovered or focused
   *
   * @returns {void}
   */
  const hide = () => {
    if (isControlled()) {
      return;
    }

    clearTimeout(enterTimer);
    leaveTimer = window.setTimeout(() => {
      setInternalOpen(false);
    }, props.leaveDelay);
  };

  /**
   * Show the tooltip when the trigger is hovered or focused
   *
   * @returns {void}
   */
  const onMouseEnter = () => {
    if (!props.disableHoverListener) {
      show();
    }
  };

  /**
   * Hide the tooltip when the trigger is no longer hovered or focused
   *
   * @returns {void}
   */
  const onMouseLeave = () => {
    if (!props.disableHoverListener) {
      hide();
    }
  };

  /**
   * Show the tooltip when the trigger is focused
   *
   * @returns {void}
   */
  const onFocus = () => {
    if (!props.disableHoverListener) {
      show();
    }
  };

  /**
   * Hide the tooltip when the trigger is blurred
   *
   * @returns {void}
   */
  const onBlur = () => {
    if (!props.disableHoverListener) {
      hide();
    }
  };

  /**
   * Show the tooltip when the trigger is clicked
   *
   * @param {*} e - The click event
   */
  const onClick = (e) => {
    props.onClick?.(e);
  };

  /**
   * Hide the tooltip when the trigger is blurred
   * @param {*} e - The blur event
   */
  const onKeyDown = (e) => {
    if (e.key === "Escape" && !isControlled()) {
      setInternalOpen(false);
    }
  };

  /**
   * Update Popper modifiers
   *
   * @param {Array} mods - Array of Popper modifiers
   * @returns {Array} - Updated array of Popper modifiers
   */
  const updateModifiers = (mods = []) =>
    (mods || []).map((m) => {
      if (m.name === "offset") {
        return { ...m, options: { offset: [0, effectiveOffset()] } };
      }
      if (m.name === "arrow") {
        return { ...m, enabled: !!props.arrow };
      }
      return m;
    });

  onMount(() => {
    const PopperCore = window.Popper;
    if (!PopperCore?.createPopper) {
      console.warn(
        "[Tooltip] Popper not found. Ensure you include Bootstrap bundle (with Popper) or @popperjs/core."
      );
      return;
    }

    popper = PopperCore.createPopper(triggerEl, tooltipEl, {
      placement: props.placement,
      modifiers: [
        { name: "offset", options: { offset: [0, effectiveOffset()] } },
        { name: "flip", options: { fallbackPlacements: ["top", "right", "bottom", "left"] } },
        { name: "preventOverflow", options: { padding: 8 } },
        { name: "arrow", enabled: !!props.arrow },
        { name: "eventListeners", enabled: false },
      ],
    });

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => popper?.update());
      if (tooltipEl) {
        resizeObserver.observe(tooltipEl);
      }
    }
  });

  createEffect(() => {
    titleValue();

    if (popper && isOpen()) {
      popper.update();
    }
  });

  createEffect(() => {
    if (!popper) {
      return;
    }

    popper.setOptions((opts) => ({
      ...opts,
      placement: props.placement,
      modifiers: updateModifiers(opts.modifiers),
    }));

    if (isOpen()) {
      popper.update();
    }
  });

  createEffect(() => {
    if (!popper) {
      return;
    }

    const open = isOpen();
    popper.setOptions((opts) => ({
      ...opts,
      modifiers: [
        ...(opts.modifiers || []).filter((m) => m.name !== "eventListeners"),
        { name: "eventListeners", enabled: open },
      ],
    }));

    if (open) {
      popper.update();
    }
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

      <${Portal} mount=${document.body}>
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
