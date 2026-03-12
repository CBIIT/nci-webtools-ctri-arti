import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import html from "solid-js/html";

/**
 * Inline select that expands in place, replacing the trigger with options
 *
 * @param {Object} props
 * @param {Array<{value: string|number, label: string}>} props.options - Dropdown options (or getter function)
 * @param {() => string|number} props.value - Reactive getter for current value
 * @param {(value: string|number) => void} props.onChange - Callback when value changes
 * @param {string} [props.placeholder] - Placeholder text when no value selected
 * @param {string} [props.id] - Optional ID for the dropdown
 * @param {string} [props.ariaLabelledBy] - ID of the label element for accessibility
 * @param {boolean} [props.disabled] - Whether the dropdown is disabled
 */
export function InlineSelect(props) {
  const [isOpen, setIsOpen] = createSignal(false);
  let containerRef;

  const getOptions = () => {
    const opts = typeof props.options === "function" ? props.options() : props.options;

    return opts || [];
  };

  const getValue = () => {
    return typeof props.value === "function" ? props.value() : props.value;
  };

  const getSelectedLabel = () => {
    const currentValue = getValue();
    const options = getOptions();
    const selected = options.find((opt) => opt.value === currentValue);

    return selected?.label || props.placeholder || "Select...";
  };

  const handleSelect = (value) => {
    props.onChange?.(value);
    setIsOpen(false);
  };

  const handleTriggerClick = () => {
    if (!props.disabled) {
      setIsOpen(true);
    }
  };

  createEffect(() => {
    if (isOpen()) {
      const handleClickOutside = (e) => {
        if (containerRef && !containerRef.contains(e.target)) {
          setIsOpen(false);
        }
      };

      document.addEventListener("click", handleClickOutside);

      onCleanup(() => document.removeEventListener("click", handleClickOutside));
    }
  });

  return html`
    <div class="custom-dropdown" ref=${(el) => (containerRef = el)}>
      <button
        type="button"
        class="custom-dropdown-trigger"
        id=${props.id}
        aria-labelledby=${props.ariaLabelledBy}
        disabled=${props.disabled}
        onClick=${handleTriggerClick}
        style=${() => (isOpen() ? "display: none" : "")}
      >
        ${getSelectedLabel}
      </button>
      <${Show} when=${isOpen}>
        <ul class="custom-dropdown-menu show">
          <${For} each=${getOptions}>
            ${(option) =>
              html`<li>
                <button
                  type="button"
                  class="dropdown-item custom-dropdown-option"
                  onClick=${() => handleSelect(option.value)}
                >
                  ${option.label}
                </button>
              </li>`}
          <//>
        </ul>
      <//>
    </div>
  `;
}

export default InlineSelect;
