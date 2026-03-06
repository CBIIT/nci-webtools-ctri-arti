import { createSignal, Switch, Match, Show } from "solid-js";
import html from "solid-js/html";
import { Check } from "lucide-solid";

function RequestLimitIncrease(props) {
  const [reason, setReason] = createSignal("");
  let limitDialog;
  const showDialog = () => {
    limitDialog.showModal();
  };
  const closeDialog = () => {
    console.log("closeDialog clicked");
    limitDialog.close();
  };

  const [status, setStatus] = createSignal("init");
  const [submitError, setSubmitError] = createSignal("");

  const hasReason = () => reason().trim().length > 0;

  const handleSubmit = async () => {
    console.log("handleSubmit called with reason:", reason());
    if (!hasReason()) {
      setSubmitError("Please provide a reason for your request.");
      return;
    }

    try {
      /* const response = await fetch('/api/v1/request-limit-increase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setSubmitError(errorData.message || 'Failed to submit your request. Please try again later.');
        return;
      } */

      setStatus("success");
    } catch (err) {
      console.error("Error submitting limit increase request:", err);
      setSubmitError("An unexpected error occurred. Please try again later.");
    }
  };

  return html`
    <div id="request-limit-increase-container">
      <button
        id="request-limit-increase-button"
        class="btn btn-primary"
        type="button"
        onClick=${() => showDialog()}
      >
        Request Limit Increase
      </button>

      <dialog
        id="request-limit-increase-dialog"
        class="request-limit-increase-dialog modal fade show"
        ref=${(el) => (limitDialog = el)}
      >
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <form>
              <${Switch}>
                <${Match} when=${() => status() === "success"}>
                  <div class="modal-header">
                    <div class="modal-title font-inter" id="exampleModalLiveLabel">
                      Request Limit Increase
                    </div>
                  </div>
                  <div class="modal-body font-inter">
                    <div class="success-container text-center">
                      <div class="icon-container"><${Check} size="36" color="#00C950" /></div>
                      <div>Your limit increase request has been submitted review.</div>
                    </div>
                  </div>
                <//>
                <${Match} when=${() => status() === "init"}>
                  <div class="modal-header">
                    <div class="modal-title font-inter" id="exampleModalLiveLabel">
                      Request Limit Increase
                    </div>
                  </div>
                  <div class="modal-body font-inter">
                    <${Show} when=${() => submitError() !== ""} fallback="">
                      <div class="alert alert-danger" role="alert">
                        Submission failed: ${() => submitError()}
                      </div>
                    <//>

                    <label class="form-label font-inter">Current Cost Limit Per Day</label>
                    <p class="form-static-value">
                      ${() => {
                        console.log("Budget function called, props.session:", props.session);
                        const sessionData = props.session;

                        if (!sessionData) {
                          return "No session data";
                        }

                        if (!sessionData.user) {
                          return "No user in session";
                        }

                        const budget = sessionData.user.budget;
                        console.log("Budget value:", budget);

                        if (budget === null || budget === undefined) {
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
                      maxlength="500"
                      value=${reason()}
                      onInput=${(e) => setReason(e.target.value)}
                    />
                    <div class="remaining-characters text-end">
                      ${() => 500 - reason().length} characters remaining
                    </div>
                  </div>
                  <div class="modal-footer d-flex gap-2 justify-content-center">
                    <button
                      type="button"
                      class="btn btn-pill btn-cancel font-nunito"
                      onClick=${() => closeDialog()}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      class="btn btn-pill btn-action font-nunito"
                      disabled=${() => !hasReason()}
                      onClick=${() => handleSubmit()}
                    >
                      Submit
                    </button>
                  </div>
                <//>
              <//>
            </form>
          </div>
        </div>
      </dialog>
    </div>
  `;
}

export default RequestLimitIncrease;
