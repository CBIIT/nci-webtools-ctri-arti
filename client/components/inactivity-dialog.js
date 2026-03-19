import { X } from "lucide-solid";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import html from "solid-js/html";

import { useAuthContext } from "../contexts/auth-context.js";
import { secondsToMinuteString } from "../utils/utils.js";

const WARN_AT = 300;

export default function InactivityDialog() {
  const { isLoggedIn, logout, expires, refreshSession, checkSession } = useAuthContext() || {};

  const [timeLeft, setTimeLeft] = createSignal(WARN_AT);
  const [warning, setWarning] = createSignal(false);
  const [timedOut, setTimedOut] = createSignal(
    sessionStorage.getItem("sessionTimedOut") === "true"
  );
  let isCheckingSession = false;

  const getSecondsLeft = (exp) => Math.max(0, Math.round((new Date(exp) - Date.now()) / 1000));

  const verifyExpiringSession = async () => {
    if (isCheckingSession) {
      return;
    }

    isCheckingSession = true;

    try {
      const session = await checkSession();
      if (session && !session.user) {
        sessionStorage.setItem("sessionTimedOut", "true");
        setTimeLeft(0);
        setWarning(false);
        return;
      }

      const nextExpires = session?.expires;
      const secs = nextExpires ? getSecondsLeft(nextExpires) : 0;

      setTimeLeft(secs);
      setWarning(secs > 0 && secs <= WARN_AT);
    } finally {
      isCheckingSession = false;
    }
  };

  createEffect(() => {
    if (!isLoggedIn()) return;

    const id = setInterval(() => {
      const exp = expires();
      if (!exp) return;
      const secs = getSecondsLeft(exp);
      setTimeLeft(secs);
      if (warning() && secs > WARN_AT) {
        setWarning(false);
        return;
      }
      if (secs <= 0) {
        sessionStorage.setItem("sessionTimedOut", "true");
        logout();
      } else if (secs <= WARN_AT && !warning()) {
        verifyExpiringSession();
      }
    }, 1000);

    onCleanup(() => clearInterval(id));
  });

  createEffect(() => {
    if (!isLoggedIn() && sessionStorage.getItem("sessionTimedOut") === "true") {
      setTimedOut(true);
      sessionStorage.removeItem("sessionTimedOut");
    }
  });

  const extend = async () => {
    await refreshSession();
    setWarning(false);
  };

  return html`
    <span>
      <${Show} when=${warning}>
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
                    onClick=${extend}
                  >
                    EXTEND SESSION
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary button-group logout-button"
                    onClick=${logout}
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
                  onKeyDown=${(e) => e.key === "Enter" && setTimedOut(false)}
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
                      window.location.href = "/api/v1/login";
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
