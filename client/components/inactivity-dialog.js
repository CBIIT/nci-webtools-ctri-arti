import { createEffect, createResource, createSignal, onCleanup, Show } from "solid-js";
import html from "solid-js/html";

import { X } from "lucide-solid";

import { useAuthContext } from "../contexts/auth-context.js";
import { secondsToMinuteString } from "../utils/utils.js";

/**
 * The time (in seconds) at which the timeout warning banner should be displayed.
 */
const timeoutThresholdSeconds = 300;

/**
 * An inactivity dialog that handles session the TTL ping and timeout.
 */
export default function InactivityDialog() {
  const [env] = createResource(() => fetch("/api/config").then((res) => res.json()));
  const { isLoggedIn, logout } = useAuthContext() || {};

  const [warning, setWarning] = createSignal(false);
  const [timedOut, setTimedOut] = createSignal(
    sessionStorage.getItem("sessionTimedOut") === "true" || false
  );
  const [timeLeft, setTimeLeft] = createSignal(timeoutThresholdSeconds);

  const extendSession = async () => {
    try {
      const res = await fetch("/api/session");
      const data = await res.json();

      if (data?.user) {
        setWarning(false);
      }
    } catch (e) {
      console.error("Error in extending session", e);
    }
  };

  const handleExtendSession = () => {
    extendSession();
  };

  const handleSignOut = (withBanner = false) => {
    logout();

    if (withBanner) {
      // enqueueSnackbar("You have been logged out.", { variant: "default" });
    }
  };

  const loadData = async () => {
    try {
      const res = await fetch("/api/session-ttl");
      const data = await res.json();
      const { ttl } = data;

      if (ttl <= 0) {
        sessionStorage.setItem("sessionTimedOut", "true");
        handleSignOut();
      } else if (ttl > 0 && ttl <= timeoutThresholdSeconds) {
        // Session expiring soon
        setTimeLeft(ttl);
        setWarning(true);
      }
    } catch (e) {
      console.error("Error in fetching session ttl", e);
      // On error, assume session might be expired
      sessionStorage.setItem("sessionTimedOut", "true");
      setTimedOut(true);
      setWarning(false);
    }
  };

  createEffect(() => {
    let intervalId;
    if (isLoggedIn()) {
      const pollInterval = env()?.sessionTtlPollMs || 10 * 1000;
      intervalId = setInterval(loadData, pollInterval);
    } else if (sessionStorage.getItem("sessionTimedOut") === "true") {
      setTimedOut(true);
      sessionStorage.removeItem("sessionTimedOut");
    }

    onCleanup(() => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    });
  });

  const handleKeyDown = (e, callback) => {
    if (e.key === "Enter") {
      callback();
    }
  };

  return html`
    <span>
      <${Show} when=${() => warning()}>
        <div
          class="modal fade show inactivity-warning-modal"
          tabindex="-1"
          style="display: block; background-color: rgba(0,0,0,0.5);"
        >
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content inactivity-warning-content">
              <div class="modal-header inactivity-warning-header">
                <h5 class="modal-title inactivity-warning-title">Session Timeout Warning</h5>
              </div>
              <div class="modal-body inactivity-warning-body">
                <div class="inactivity-warning-text">
                  This session is about to expire due to inactivity.
                  <br />
                  You will be logged out in ${() => ` ${secondsToMinuteString(timeLeft())} `}
                  minutes.
                  <br />
                  Please elect to extend this session or logout.
                </div>
                <div class="button-wrapper">
                  <button
                    type="button"
                    class="btn btn-secondary button-group extend-button"
                    onClick=${handleExtendSession}
                  >
                    EXTEND SESSION
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary button-group logout-button"
                    onClick=${() => handleSignOut(true)}
                  >
                    LOGOUT
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      <//>
      <${Show} when=${() => !isLoggedIn() && timedOut()}>
        <div
          class="modal fade show session-timeout-modal"
          tabindex="-1"
          style="display: block; background-color: rgba(0,0,0,0.5);"
        >
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content session-timeout-content">
              <div class="modal-header session-timeout-header">
                <div
                  class="close-icon"
                  onClick=${() => setTimedOut(false)}
                  onKeyDown=${(e) => handleKeyDown(e, () => setTimedOut(false))}
                  tabindex="0"
                  role="button"
                >
                  <${X} size="16" color="#44627C" class="close-icon-img" alt="close icon" />
                </div>
              </div>
              <div class="modal-body session-timeout-body">
                <div class="session-timeout-title">Your session has expired.</div>
                <br />
                <div class="session-timeout-message">Please login again to continue working.</div>
                <div class="button-wrapper">
                  <button
                    type="button"
                    class="btn btn-secondary button-group close-button"
                    onClick=${() => setTimedOut(false)}
                  >
                    CLOSE
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary button-group login-button"
                    onClick=${() => {
                      setTimedOut(false);
                      window.location.href = "/api/login";
                    }}
                  >
                    LOGIN
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      <//>
    </span>
  `;
}
