import { createSignal, Show } from "solid-js";
import html from "solid-js/html";

import { showAlert } from "../../utils/alerts.js";

/**
 * A SolidJS component that renders a button and modal dialog for users to request
 * an increase in their daily cost limit. The component displays the user's current
 * budget and provides a form to submit a request with justification.
 *
 * @description The component manages a two-state modal interface:
 * - Initial state: Form with reason textarea and current budget display
 * - Success state: Confirmation message after successful submission
 *
 * Features:
 * - Displays current daily cost limit (shows "Unlimited" if budget is null)
 * - Textarea with 500 character limit and remaining character counter
 * - Client-side validation requiring a non-empty reason
 * - Form submission with loading state and error handling
 * - API integration with `/api/v1/usage` endpoint
 * - Success confirmation UI after successful submission
 *
 * @param {Object} props - Component properties
 * @param {Object} props.user - User object from the user
 * @param {number|null} props.user.budget - User's current daily cost limit in USD (null means unlimited)
 *
 * @returns {JSX.Element} A SolidJS component containing a trigger button and modal dialog
 *
 * @example
 * // Basic usage
 * <RequestLimitIncrease />
 *
 * @example
 * // Basic usage with user data
 * <RequestLimitIncrease user={user} />
 *
 * @example
 * // Example user structure expected by component
 * const user = {
 *   budget: 50 // $50 daily limit, or null for unlimited
 * }
 *
 * @throws {Error} Displays user-friendly error messages for failed API requests
 *
 * @since 1.0.0
 */
function RequestLimitIncrease(props) {
  const [reason, setReason] = createSignal("");
  let limitDialog;
  const currentUser = () => (typeof props.user === "function" ? props.user() : props.user);
  const showDialog = () => {
    limitDialog?.showModal?.();
  };
  const closeDialog = () => {
    resetDialog();
    limitDialog?.close?.();
  };
  const resetDialog = () => {
    setReason("");
    setSubmitError("");
    setIsSubmitting(false);
  };

  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [submitError, setSubmitError] = createSignal("");

  const hasReason = () => reason().trim().length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setIsSubmitting(true);
      setSubmitError("");

      const response = await fetch("/api/v1/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ justification: reason() }),
      });

      if (!response.ok) {
        let errorData = {};
        try {
          errorData = await response.json();
        } catch (_error) {
          errorData = {};
        }
        setSubmitError(errorData.error || "Failed to submit your request. Please try again later.");
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      showAlert({
        message: "Your limit increase request has been submitted for review.",
        type: "success",
      });
      closeDialog();
    } catch (err) {
      console.error("Error submitting limit increase request:", err);
      setSubmitError("An unexpected error occurred. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return html`
    <div id="request-limit-increase-container">
      <button id="request-limit-increase-button" type="button" onClick=${() => showDialog()}>
        Request Limit Increase
      </button>

      <dialog
        id="request-limit-increase-dialog"
        class="request-limit-increase-dialog modal fade show"
        onClose=${() => resetDialog()}
        ref=${(el) => (limitDialog = el)}
      >
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <form onSubmit=${handleSubmit}>
              <div class="modal-header">
                <div class="modal-title font-inter" id="exampleModalLiveLabel">
                  Request Limit Increase
                </div>
              </div>
              <div class="modal-body font-inter">
                <${Show} when=${() => submitError() !== ""} fallback="">
                  <div class="alert alert-danger" role="alert">${() => submitError()}</div>
                <//>

                <label class="form-label font-inter no-mb">Current Cost Limit Per Day</label>
                <p class="form-static-value">
                  ${() => {
                    const user = currentUser();

                    if (!user) {
                      return "No user";
                    }

                    const budget = user.budget;

                    if (budget === null) {
                      return "Unlimited";
                    }
                    return `$${budget}`;
                  }}
                </p>

                <label for="reason-for-request-ta" class="form-label mt-25 required"
                  >Reason for Request</label
                >
                <textarea
                  id="reason-for-request-ta"
                  placeholder="Describe your role, organization, which tools you plan to use (e.g., Chat, ConsentCrafter, Translator), estimated usage volume, and expected frequency (e.g., daily, weekly). Maximum of 500 characters."
                  name="reason-for-request-ta"
                  rows="5"
                  class="form-control"
                  classList=${() => submitError().length > 0}
                  maxlength="500"
                  value=${() => reason()}
                  onInput=${(e) => setReason(e.target.value)}
                />
                <div class="remaining-characters text-end font-inter">
                  ${() => 500 - reason().length} characters remaining
                </div>
              </div>
              <div class="modal-footer d-flex gap-2 justify-content-center">
                <button
                  id="cancel-limit-increase-button"
                  type="button"
                  class="btn btn-pill btn-cancel font-nunito"
                  disabled=${() => isSubmitting()}
                  onClick=${() => closeDialog()}
                >
                  Cancel
                </button>
                <button
                  id="submit-limit-increase-button"
                  type="submit"
                  class="btn btn-pill btn-action font-nunito"
                  disabled=${() => isSubmitting() || !hasReason()}
                >
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      </dialog>
    </div>
  `;
}

export default RequestLimitIncrease;
