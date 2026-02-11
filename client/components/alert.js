import { createEffect, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import html from "solid-js/html";

import { Check, Flag } from "lucide-solid";

import { reportErrorToServer } from "../utils/error-reporter.js";

/**
 * Alert component for displaying dismissible alerts
 *
 * @param {object} props
 * @param {string} props.type - Alert type: 'danger', 'warning', 'success', 'info'
 * @param {string} props.message - Alert message text
 * @param {boolean} props.dismissible - Whether the alert can be dismissed
 * @param {number} props.autoDismiss - Auto-dismiss timeout in milliseconds (0 = no auto-dismiss)
 * @param {function} props.onDismiss - Callback when alert is dismissed
 * @param {object} props.errorData - Additional error data for reporting
 * @param {function} props.onCollectAdditionalData - Callback to collect additional context data
 * @returns Alert component
 */
export default function Alert(props) {
  const [visible, setVisible] = createSignal(true);
  const [isHovered, setIsHovered] = createSignal(false);
  const [reportStatus, setReportStatus] = createSignal(null);

  const dismiss = () => {
    setVisible(false);
    props.onDismiss?.();
  };

  const reportError = async () => {
    setReportStatus("loading");

    let additionalData = null;
    const collectFn = props.onCollectAdditionalData;
    if (collectFn) {
      try {
        additionalData = typeof collectFn === "function" ? await collectFn() : await collectFn;
      } catch (err) {
        console.error("Failed to collect additional error report data:", err);
      }
    }

    const success = await reportErrorToServer({
      message: props.errorData?.message || props.message || "Unknown error",
      stack: props.errorData?.stack,
      code: props.errorData?.code || "N/A",
      reportSource: "User",
      additionalData,
    });

    setReportStatus(success ? "success" : "error");
  };

  // Auto-dismiss functionality
  createEffect(() => {
    if (props.autoDismiss && props.autoDismiss > 0) {
      const timer = setInterval(() => {
        if (visible() && !isHovered()) {
          dismiss();
        }
      }, props.autoDismiss);

      onCleanup(() => clearInterval(timer));
    }
  });

  const alertClass = () => {
    const baseClass = "alert";
    const typeClass = `alert-${props.type || "info"}`;
    const dismissibleClass = props.dismissible ? "alert-dismissible" : "";
    const reportableClass = props.type === "danger" ? "alert-reportable" : "";
    return [baseClass, typeClass, dismissibleClass, reportableClass].filter(Boolean).join(" ");
  };

  const isLoading = () => reportStatus() === "loading";

  return html`
    <${Show} when=${() => visible() === true}>
      <div
        class=${alertClass}
        role="alert"
        onMouseEnter=${() => setIsHovered(true)}
        onMouseLeave=${() => setIsHovered(false)}
      >
        <${Switch}>
          <${Match} when=${() => reportStatus() === "success"}>
            <div class="text-success d-flex align-items-center gap-2">
              <${Check} size="16" />
              Your error report has been sent to the ResearchOptimizer team.
            </div>
          <//>
          <${Match} when=${() => reportStatus() === "error"}>
            <div class="text-danger">
              There was an issue sending the report. Please try again later.
            </div>
          <//>
          <${Match} when=${() => reportStatus() === null || reportStatus() === "loading"}>
            <div>${() => props.message}</div>
            <${Show} when=${props.type === "danger"}>
              <div class="mt-2">
                <button
                  type="button"
                  class="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-2"
                  onClick=${reportError}
                  disabled=${isLoading}
                  title="Report this error"
                >
                  <${Show} when=${isLoading} fallback=${html`<${Flag} size="16" />`}>
                    <span
                      class="spinner-border spinner-border-sm"
                      role="status"
                      aria-hidden="true"
                    ></span>
                  <//>
                  Report
                </button>
              </div>
            <//>
          <//>
        <//>
        <${Show} when=${props.dismissible}>
          <button type="button" class="btn-close" aria-label="Close" onClick=${dismiss}></button>
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
 * @param {function} props.onCollectAdditionalData - Callback to collect additional context
 * @returns Alert container component
 */
export function AlertContainer(props) {
  const getAutoDismiss = (alert) => {
    if (alert?.autoDismiss !== undefined) {
      return alert.autoDismiss;
    }

    return 5000;
  };

  return html`
    <${Show} when=${() => props.alerts && props.alerts.length > 0}>
      <div class="alert-container position-fixed top-0 start-50 translate-middle-x p-3">
        <${For} each=${() => props.alerts || []}>
          ${(alert) => html`
            <${Alert}
              type=${alert.type}
              message=${alert.message}
              dismissible=${alert.dismissible !== false}
              autoDismiss=${getAutoDismiss(alert)}
              errorData=${alert.errorData}
              onCollectAdditionalData=${props.onCollectAdditionalData}
              onDismiss=${() => props.onDismiss?.(alert.id)}
            />
          `}
        <//>
      </div>
    <//>
  `;
}
