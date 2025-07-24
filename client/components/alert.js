import { createSignal, createEffect, onCleanup, Show, For } from "solid-js";
import html from "solid-js/html";

/**
 * Alert component for displaying dismissible alerts
 * 
 * @param {object} props
 * @param {string} props.type - Alert type: 'danger', 'warning', 'success', 'info'
 * @param {string} props.message - Alert message text
 * @param {boolean} props.dismissible - Whether the alert can be dismissed
 * @param {number} props.autoDismiss - Auto-dismiss timeout in milliseconds (0 = no auto-dismiss)
 * @param {function} props.onDismiss - Callback when alert is dismissed
 * @returns Alert component
 */
export default function Alert(props) {
  const [visible, setVisible] = createSignal(true);
  
  const dismiss = () => {
    setVisible(false);
    props.onDismiss?.();
  };

  // Auto-dismiss functionality
  createEffect(() => {
    if (props.autoDismiss && props.autoDismiss > 0) {
      const timer = setTimeout(() => {
        if (visible()) {
          dismiss();
        }
      }, props.autoDismiss);
      
      onCleanup(() => clearTimeout(timer));
    }
  });

  const alertClass = () => {
    const baseClass = "alert";
    const typeClass = `alert-${props.type || 'info'}`;
    const dismissibleClass = props.dismissible ? "alert-dismissible" : "";
    return [baseClass, typeClass, dismissibleClass].filter(Boolean).join(" ");
  };

  return html`
    <${Show} when=${visible}>
      <div class=${alertClass} role="alert">
        ${() => props.message}
        <${Show} when=${props.dismissible}>
          <button 
            type="button" 
            class="btn-close" 
            aria-label="Close"
            onClick=${dismiss}>
          </button>
        <//>
      </div>
    <//>
  `;
}

/**
 * Alert container component for displaying multiple alerts
 * 
 * @param {object} props
 * @param {Array} props.alerts - Array of alert objects
 * @param {function} props.onDismiss - Callback when an alert is dismissed
 * @returns Alert container component
 */
export function AlertContainer(props) {
  return html`
    <div class="alert-container position-absolute top-0 start-50 translate-middle-x p-3" style="z-index: 1050; max-width: 800px; width: 100%;">
      <${For} each=${() => props.alerts || []}>
        ${(alert) => html`
          <${Alert}
            type=${alert.type}
            message=${alert.message}
            dismissible=${alert.dismissible !== false}
            autoDismiss=${alert.autoDismiss || 5000}
            onDismiss=${() => props.onDismiss?.(alert.id)}
          />
        `}
      <//>
    </div>
  `;
}