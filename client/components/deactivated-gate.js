import { Show } from "solid-js";
import html from "solid-js/html";

import { useAuthContext } from "../contexts/auth-context.js";

import Alert from "./alert.js";

export default function DeactivatedGate() {
  const { accountDeactivated, clearDeactivated } = useAuthContext();

  return html`
    <${Show} when=${accountDeactivated}>
      <div class="position-fixed top-0 start-50 translate-middle-x p-3" style="z-index:1055">
        <${Alert}
          type="danger"
          message="Your account has been deactivated. Please contact your administrator for assistance."
          dismissible=${true}
          reportable=${false}
          autoDismiss=${0}
          onDismiss=${() => clearDeactivated()}
        />
      </div>
    <//>
  `;
}
