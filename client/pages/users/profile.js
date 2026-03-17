import { createResource, createSignal, ErrorBoundary, Show } from "solid-js";
import html from "solid-js/html";

import { AlertContainer } from "../../components/alert.js";
import { alerts, clearAlert, handleError, handleHttpError, showAlert } from "../../utils/alerts.js";

import RequestLimitIncrease from "./request-limit-increase.js";

const fetchConfig = () => fetch("/api/config").then((r) => r.json());

function UserProfile() {
  const [config] = createResource(fetchConfig);
  const [saving, setSaving] = createSignal(false);

  // Fetch current user session
  const [session] = createResource(async () => {
    try {
      const response = await fetch("/api/v1/session");
      if (!response.ok) {
        await handleHttpError(response, "fetching your profile");
        return null;
      }
      return response.json();
    } catch (err) {
      const error = new Error("Something went wrong while retrieving your profile.");
      error.cause = err;
      handleError(error, "Session API Error");
      return null;
    }
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    try {
      const formData = new FormData(e.target);
      const profileData = {
        firstName: formData.get("firstName"),
        lastName: formData.get("lastName"),
      };

      const response = await fetch("/api/v1/admin/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        await handleHttpError(response, "saving your profile");
        return;
      }

      showAlert({ message: "Success! Your profile has been updated.", type: "success" });
    } catch (err) {
      const error = new Error("Something went wrong while saving your profile.");
      error.cause = err;
      handleError(error, "Profile Save Error");
    } finally {
      setSaving(false);
    }
  }

  return html`
    <${AlertContainer} alerts=${alerts} onDismiss=${clearAlert} />
    <${ErrorBoundary}
      fallback=${(error) => {
        handleError(error, "User Profile Error");
        return null;
      }}
    >
      <div class="bg-profile font-smooth">
        <div
          class="d-flex align-items-center profile-banner"
          aria-label="Profile Management Banner"
        >
          <div class="container">
            <h1 class="profile-title fw-medium font-outfit text-white mb-0">User Profile</h1>
          </div>
        </div>
        <div class="container profile-container">
          <!-- Error Alert -->
          <${Show} when=${() => session.error}>
            <div class="alert alert-danger" role="alert">
              ${() => session.error || "An error occurred while loading your profile"}
            </div>
          <//>

          <!-- Loading State -->
          <${Show} when=${() => session.loading}>
            <div class="d-flex justify-content-center my-5">
              <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
            </div>
          <//>
          <${Show} when=${() => !session.loading}>
            <div class="profile-card mx-auto">
              <!-- Profile Icon and Email -->
              <div class="text-center profile-header">
                <div
                  class="profile-card-icon-wrapper d-inline-flex align-items-center justify-content-center"
                >
                  <img
                    class="profile-card-icon"
                    src="assets/images/users/user_icon.svg"
                    alt="Profile Icon"
                  />
                </div>
                <div class="profile-card-email text-center fw-medium mt-3 text-break">
                  ${() => session()?.user?.email || ""}
                </div>
              </div>

              <form onSubmit=${handleSubmit}>
                <!-- Account Type -->
                <div class="mb-3">
                  <span class="profile-form-label">Account Type</span>
                  <div class="profile-form-value fw-medium text-break">NIH</div>
                </div>

                <!-- Email -->
                <div class="mb-3">
                  <span class="profile-form-label">Email</span>
                  <div class="profile-form-value fw-medium text-break">
                    ${() => session()?.user?.email || ""}
                  </div>
                </div>

                <!-- First Name -->
                <div class="mb-3">
                  <label for="firstName" class="profile-form-label">First Name</label>
                  <input
                    type="text"
                    class="form-control profile-form-value fw-medium"
                    id="firstName"
                    name="firstName"
                    value=${() => session()?.user?.firstName || ""}
                    placeholder="Enter first name"
                  />
                </div>

                <!-- Last Name -->
                <div class="mb-3">
                  <label for="lastName" class="profile-form-label">Last Name</label>
                  <input
                    type="text"
                    class="form-control profile-form-value fw-medium"
                    id="lastName"
                    name="lastName"
                    value=${() => session()?.user?.lastName || ""}
                    placeholder="Enter last name"
                  />
                </div>

                <!-- Status -->
                <div class="mb-3">
                  <span class="profile-form-label">Status</span>
                  <div class="profile-form-value fw-medium text-capitalize">
                    ${() => session()?.user?.status || ""}
                  </div>
                </div>

                <!-- Role -->
                <div class="mb-3">
                  <span class="profile-form-label">Role</span>
                  <div class="profile-form-value fw-medium text-capitalize">
                    ${() => session()?.user?.Role?.name || ""}
                  </div>
                </div>

                <!-- Cost Limit -->
                <div class="mb-3">
                  <span class="profile-form-label"
                    >${() => config()?.budgetLabel || ""} Cost Limit</span
                  >
                  <div class="d-flex align-items-center">
                    <span class="profile-form-value fw-medium">
                      ${() => {
                        const user = session()?.user;
                        if (user?.budget === null) {
                          return "Unlimited";
                        }

                        return "$" + (user?.budget || 0);
                      }}
                    </span>
                    <span class="profile-cost-limit-divider"></span>
                    <span class="profile-cost-limit-note"
                      >The limit will be reset at midnight.</span
                    >
                  </div>
                </div>

                <div>
                  <${RequestLimitIncrease} session=${() => session()} />
                </div>

                <hr class="profile-divider my-4" />

                <!-- Form Buttons -->
                <div class="d-flex justify-content-center">
                  <button type="submit" class="btn btn-save-primary" disabled=${saving}>
                    Save
                  </button>
                </div>
              </form>
            </div>
          <//>
        </div>
      </div>
    <//>
  `;
}

export default UserProfile;
