import { useNavigate, useParams } from "@solidjs/router";
import { createResource, createSignal, ErrorBoundary, Show } from "solid-js";
import html from "solid-js/html";

import { AlertContainer } from "../../components/alert.js";
import { InlineSelect } from "../../components/inline-select.js";
import { alerts, clearAlert, handleError, handleHttpError } from "../../utils/alerts.js";
import { capitalize } from "../../utils/utils.js";

const fetchConfig = () => fetch("/api/config").then((r) => r.json());

function UserEdit() {
  const params = useParams();
  const navigate = useNavigate();
  const [config] = createResource(fetchConfig);
  const [user, setUser] = createSignal({
    email: "",
    firstName: "",
    lastName: "",
    status: "active",
    roleID: 3,
    budget: 0,
    remaining: 0,
    noLimit: false,
  });
  const [originalBudget, setOriginalBudget] = createSignal(0);
  const [generateApiKey] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  // Default value mapping based on role ID
  const DEFAULT_ROLE_LIMITS = {
    1: { budget: null, noLimit: true }, // Admin
    2: { budget: 10, noLimit: false }, // Super Admin
    3: { budget: 1, noLimit: false }, // User
  };

  // Fetch roles data using resource
  const [roles] = createResource(async () => {
    try {
      const response = await fetch("/api/v1/admin/roles");
      if (!response.ok) {
        await handleHttpError(response, "fetching roles");
        return [];
      }
      return response.json();
    } catch (err) {
      const error = new Error("Something went wrong while retrieving roles.");
      error.cause = err;
      handleError(error, "Roles API Error");
      return [];
    }
  });

  // Fetch user data to edit (admin only)
  const [userData] = createResource(async () => {
    if (!params.id) {
      return null; // No user ID provided
    }

    try {
      const response = await fetch(`/api/v1/admin/users/${params.id}`);
      if (!response.ok) {
        await handleHttpError(response, "fetching user details");
        return null;
      }
      const data = await response.json();
      // Set noLimit flag based on budget being null
      data.noLimit = data.budget === null;
      setUser(data);
      setOriginalBudget(data.budget || 0);
      return data;
    } catch (err) {
      const error = new Error("Something went wrong while retrieving user details.");
      error.cause = err;
      error.userId = params.id;
      handleError(error, "User Data API Error");
      return null;
    }
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    try {
      const userData = { ...user() };

      // Include ID for user being edited
      userData.id = params.id;

      // Handle no limit case - send null for budget when noLimit is true
      if (userData.noLimit) {
        userData.budget = null;
      }
      delete userData.noLimit; // Remove the UI-only property

      if (userData.budget !== originalBudget()) {
        userData.remaining = userData.budget; // Reset remaining if budget changes
      }

      // Include generateApiKey flag if checked
      if (generateApiKey()) {
        userData.generateApiKey = true;
      }

      const response = await fetch("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        await handleHttpError(response, "saving user");
        return;
      }

      // Navigate with success message in state
      navigate("/_/users", {
        state: {
          alertMessage: "User successfully updated!",
          alertType: "success",
        },
      });
    } catch (err) {
      const error = new Error("Something went wrong while saving user.");
      error.cause = err;
      handleError(error, "User Save Error");
    } finally {
      setSaving(false);
    }
  }

  function handleRoleChange(roleID) {
    // Simply update the role ID without changing budget settings
    setUser((prev) => ({ ...prev, roleID, ...(DEFAULT_ROLE_LIMITS[roleID] || {}) }));
  }

  function handleInputChange(field, value) {
    setUser((prev) => ({ ...prev, [field]: value }));
  }

  function handleNoLimitChange(checked) {
    setUser((prev) => ({
      ...prev,
      noLimit: checked,
      budget: checked ? null : DEFAULT_ROLE_LIMITS[prev.roleID]?.budget || 0,
    }));
  }

  return html`
    <${AlertContainer} alerts=${alerts} onDismiss=${clearAlert} />
    <${ErrorBoundary}
      fallback=${(error) => {
        handleError(error, "User Edit Error");
        return null;
      }}
    >
      <div class="bg-profile font-smooth">
        <div
          class="d-flex align-items-center profile-banner"
          role="img"
          aria-label="Profile Management Banner"
        >
          <div class="container">
            <h1 class="profile-title fw-medium font-outfit text-white mb-0">Edit User</h1>
          </div>
        </div>
        <div class="container profile-container">
          <!-- Error Alert -->
          <${Show} when=${() => roles.error || userData.error}>
            <div class="alert alert-danger" role="alert">
              ${() => roles.error || userData.error || "An error occurred while fetching data"}
            </div>
          <//>

          <!-- Loading State -->
          <${Show} when=${() => roles.loading || userData.loading}>
            <div class="d-flex justify-content-center my-5">
              <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
            </div>
          <//>
          <${Show} when=${() => !roles.loading && !userData.loading}>
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
                  ${() => user().email || ""}
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
                    ${() => user().email || ""}
                  </div>
                </div>

                <!-- First Name -->
                <div class="mb-3">
                  <label for="firstName" class="profile-form-label">First Name</label>
                  <input
                    type="text"
                    class="form-control profile-form-value fw-medium"
                    id="firstName"
                    value=${() => user().firstName || ""}
                    onInput=${(e) => handleInputChange("firstName", e.target.value)}
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
                    value=${() => user().lastName || ""}
                    onInput=${(e) => handleInputChange("lastName", e.target.value)}
                    placeholder="Enter last name"
                  />
                </div>

                <!-- Status -->
                <div class="mb-3">
                  <span id="status-label" class="profile-form-label"
                    >Status<span class="text-danger profile-required-asterisk">*</span></span
                  >
                  <${InlineSelect}
                    id="status"
                    ariaLabelledBy="status-label"
                    options=${[
                      { value: "active", label: "Active" },
                      { value: "inactive", label: "Inactive" },
                    ]}
                    value=${() => user().status || "active"}
                    onChange=${(value) => handleInputChange("status", value)}
                  />
                </div>

                <!-- Role -->
                <div class="mb-3">
                  <span id="roleID-label" class="profile-form-label">Role</span>
                  <${InlineSelect}
                    id="roleID"
                    ariaLabelledBy="roleID-label"
                    options=${() =>
                      (roles() || []).map((role) => ({
                        value: role.id,
                        label: capitalize(role.name),
                      }))}
                    value=${() => user().roleID}
                    onChange=${(value) => handleRoleChange(parseInt(value))}
                  />
                </div>

                <!-- Cost Limit -->
                <div>
                  <label for="budget" class="profile-form-label"
                    >${() => config()?.budgetLabel || ""} Cost Limit</label
                  >
                  <div class="profile-budget-wrapper d-flex align-items-stretch">
                    <div class="profile-budget-input-group d-flex align-items-center p-0">
                      <span
                        class="profile-budget-adornment d-flex justify-content-center align-items-center"
                        >$</span
                      >
                      <input
                        type="text"
                        inputmode="numeric"
                        class="profile-budget-input fw-medium"
                        disabled=${() => user().noLimit}
                        id="budget"
                        value=${() => (user().noLimit ? 0 : (user().budget ?? ""))}
                        onInput=${(e) => {
                          const filtered = e.target.value.replace(/[^0-9]/g, "");
                          e.target.value = filtered;
                          handleInputChange("budget", filtered === "" ? "" : parseInt(filtered));
                        }}
                        onBlur=${(e) => {
                          if (e.target.value === "") {
                            handleInputChange("budget", 0);
                          }
                        }}
                        aria-label="Cost limit"
                      />
                    </div>
                    <${Show} when=${() => params.id}>
                      <button
                        type="button"
                        disabled=${() => user().noLimit}
                        class="profile-budget-reset-btn d-flex justify-content-center align-items-center cursor-pointer"
                        onClick=${() => {
                          setUser((prev) => ({
                            ...prev,
                            budget: DEFAULT_ROLE_LIMITS[prev.roleID]?.budget,
                            noLimit: DEFAULT_ROLE_LIMITS[prev.roleID]?.noLimit,
                          }));
                        }}
                      >
                        <img src="assets/images/icon-reset.svg" alt="Reset" />
                      </button>
                    <//>
                  </div>
                  <div class="profile-checkbox-wrapper d-flex align-items-center mt-2">
                    <input
                      class="profile-checkbox"
                      type="checkbox"
                      id="noLimitCheckbox"
                      checked=${() => user().noLimit}
                      onChange=${(e) => handleNoLimitChange(e.target.checked)}
                      aria-label="Unlimited checkbox"
                    />
                    <label class="profile-checkbox-label" for="noLimitCheckbox">Unlimited</label>
                  </div>
                </div>

                <hr class="profile-divider my-4" />

                <!-- Form Buttons -->
                <div class="d-flex justify-content-center">
                  <button type="submit" class="btn btn-save-primary" disabled=${saving}>
                    ${() => (saving() ? "Saving..." : "Save")}
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

export default UserEdit;
