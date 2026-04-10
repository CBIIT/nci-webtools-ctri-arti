import { createResource, createSignal, ErrorBoundary, onMount, Show } from "solid-js";
import html from "solid-js/html";

import { AlertContainer } from "../../components/alert.js";
import { PageBanner } from "../../components/page-banner.js";
import { Status, useAuthContext } from "../../contexts/auth-context.js";
import { alerts, clearAlert, handleError, handleHttpError, showAlert } from "../../utils/alerts.js";
import { fetchCachedJson } from "../../utils/static-data.js";

import RequestLimitIncrease from "./request-limit-increase.js";

const fetchConfig = () => fetchCachedJson("/api/config");

function UserProfile() {
  const { user, status, setData, checkSession } = useAuthContext();
  const [config] = createResource(fetchConfig);
  const [saving, setSaving] = createSignal(false);

  onMount(() => {
    checkSession();
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

      const updatedUser = await response.json();
      setData(updatedUser);
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
        <${PageBanner} title="User Profile" />
        <div class="container profile-container">
          <!-- Error Alert -->
          <${Show} when=${() => status() === Status.ERROR}>
            <div class="alert alert-danger" role="alert">
              An error occurred while loading your profile
            </div>
          <//>

          <!-- Loading State -->
          <${Show} when=${() => status() === Status.LOADING}>
            <div class="d-flex justify-content-center my-5">
              <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
            </div>
          <//>
          <${Show} when=${() => status() !== Status.LOADING}>
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
                  ${() => user()?.email || ""}
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
                    ${() => user()?.email || ""}
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
                    value=${() => user()?.firstName || ""}
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
                    value=${() => user()?.lastName || ""}
                    placeholder="Enter last name"
                  />
                </div>

                <!-- Status -->
                <div class="mb-3">
                  <span class="profile-form-label">Status</span>
                  <div class="profile-form-value fw-medium text-capitalize">
                    ${() => user()?.status || ""}
                  </div>
                </div>

                <!-- Role -->
                <div class="mb-3">
                  <span class="profile-form-label">Role</span>
                  <div class="profile-form-value fw-medium text-capitalize">
                    ${() => user()?.Role?.name || ""}
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
                        const currentUser = user();
                        if (currentUser?.budget === null) {
                          return "Unlimited";
                        } else {
                          return `$${currentUser?.budget}`;
                        }
                      }}
                    </span>
                    <span class="profile-cost-limit-divider"></span>
                    <span class="profile-cost-limit-note"
                      >The limit will be reset at midnight.</span
                    >
                  </div>
                </div>

                <div>
                  <${RequestLimitIncrease} user=${() => user()} />
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
