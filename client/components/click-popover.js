import html from "solid-js/html";

/**
 * ClickPopover component for displaying click-triggered popovers
 * 
 * @param {object} props
 * @param {boolean} props.open - Whether the popover is open
 * @param {function} props.setOpen - Function to set the popover open state
 * @param {string} props.content - HTML content for the popover
 * @param {function} props.children - Trigger element content
 * @returns {JSX.Element}
 */
export default function ClickPopover(props) {
  const handleTriggerClick = () => {
    props.setOpen(!props.open);
  };

  return html`
    <div class="position-relative">
      <div class="clickable-trigger" onClick=${handleTriggerClick}>
        ${props.children}
      </div>
      <div class=${() => `click-popover ${props.open ? 'show' : ''}`}>
        ${props.content}
      </div>
    </div>
  `;
}