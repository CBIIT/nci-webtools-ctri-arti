import html from "solid-js/html";

import { ChevronDown } from "lucide-solid";

/**
 * Tool Header Component
 *
 * @param {*} props - The props for the component
 * @param {*} props.icon - Icon to display on the left side
 * @param {string} props.title - Title to display in the header
 * @param {*} props.right - Element to display on the right side
 * @param {Function} props.isOpen - Function to determine if the tool is open
 * @param {Function} props.onToggle - Function to toggle the tool's open state
 * @param {string} props.bodyId - The ID for the tool's body element
 * @returns {JSX.Element}
 */
export default function ToolHeader(props) {
  const isOpen = props.isOpen || (() => false);

  return html`
    <div
      class="search-accordion__toggle w-100 d-flex flex-row align-items-center justify-content-between px-3 py-2 text-body-secondary rounded-3 min-w-0"
    >
      <div
        class="d-flex flex-row align-items-center gap-2 flex-grow-1 min-w-0"
        role="button"
        tabindex="0"
        aria-expanded=${isOpen}
        aria-controls=${props.bodyId}
        onClick=${props.onToggle}
        onKeyDown=${(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            props.onToggle?.();
          }
        }}
      >
        <span
          class="d-inline-flex align-items-center justify-content-center"
          style="width:20px;height:20px;"
        >
          ${props.icon}
        </span>
        <span class="text-truncate fw-normal">${props.title}</span>
      </div>

      <div
        class="d-flex flex-row align-items-center gap-2 flex-shrink-0"
        onClick=${(e) => e.stopPropagation()}
        onMouseDown=${(e) => e.stopPropagation()}
      >
        ${props.right}
      </div>

      <button
        type="button"
        class="btn-reset d-inline-flex ms-2"
        aria-label=${() => (isOpen() ? "Collapse" : "Expand")}
        aria-expanded=${isOpen}
        aria-controls=${props.bodyId}
        onClick=${props.onToggle}
      >
        <span class="chevron d-inline-flex">
          <${ChevronDown} size="20" class="text-body-tertiary" />
        </span>
      </button>
    </div>
  `;
}
