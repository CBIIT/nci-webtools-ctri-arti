import { createSignal, Show } from "solid-js";
import html from "solid-js/html";
import { useParams, useNavigate } from "@solidjs/router";
import { createResource } from "solid-js";
import { capitalize } from "/utils/utils.js";

function UserEdit() {
  const params = useParams();
  const navigate = useNavigate();
  const [user, setUser] = createSignal({
    email: "",
    firstName: "",
    lastName: "",
    status: "active",
    roleId: 3,
    limit: 0,
    remaining: 0,
    noLimit: false,
  });
  const [originalLimit, setOriginalLimit] = createSignal(0);
  const [generateApiKey, setGenerateApiKey] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  // Default value mapping based on role ID
  const DEFAULT_ROLE_LIMITS = {
    1: { limit: null, noLimit: true }, // Admin
    2: { limit: 10, noLimit: false }, // Super Admin
    3: { limit: 5, noLimit: false }, // User
  };

  // Fetch roles data using resource
  const [roles] = createResource(() => fetch("/api/admin/roles").then((res) => res.json()));

  // Fetch user data to edit (admin only)
  const [userData] = createResource(() => {
    if (!params.id) {
      return null; // No user ID provided
    }

    return fetch(`/api/admin/users/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        // Set noLimit flag based on limit being null
        data.noLimit = data.limit === null;
        setUser(data);
        setOriginalLimit(data.limit || 0);
        return data;
      });
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    try {
      const userData = { ...user() };

      // Include ID for user being edited
      userData.id = params.id;

      // Handle no limit case - send null for limit when noLimit is true
      if (userData.noLimit) {
        userData.limit = null;
      }
      delete userData.noLimit; // Remove the UI-only property

      if (userData.limit !== originalLimit()) {
        userData.remaining = userData.limit; // Reset remaining to if limit changes
      }

      // Include generateApiKey flag if checked
      if (generateApiKey()) {
        userData.generateApiKey = true;
      }

      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save user");
      }

      // Navigate with success message in state
      navigate("/_/users", {
        state: {
          alertMessage: "User successfully updated!",
          alertType: "success",
        },
      });
    } catch (err) {
      console.error("Error saving user:", err);
      alert(err.message || "An error occurred while saving the user");
    } finally {
      setSaving(false);
    }
  }

  function handleRoleChange(roleId) {
    // Simply update the role ID without changing limit settings
    setUser((prev) => ({ ...prev, roleId, ...(DEFAULT_ROLE_LIMITS[roleId] || {}) }));
  }

  function handleInputChange(field, value) {
    setUser((prev) => ({ ...prev, [field]: value }));
  }

  function handleNoLimitChange(checked) {
    setUser((prev) => ({
      ...prev,
      noLimit: checked,
      limit: checked ? null : DEFAULT_ROLE_LIMITS[prev.roleId]?.limit || 0,
    }));
  }

  function copyToClipboard(text) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        alert("API Key copied to clipboard!");
      })
      .catch((err) => {
        console.error("Could not copy text: ", err);
      });
  }

  return html`
    <img
      src="assets/images/users/profile_banner.png"
      alt="Profile Management Banner"
      class="img-fluid object-fit-cover w-100"
      style="height:153px;"
    />
    <div class="container pb-4">
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

      <!-- User Form -->
      <div class="row position-relative mb-5" style="margin-top:-80px">
        <h1
          class="offset-sm-2 offset-md-3 offset-xl-4 col-auto font-title text-white fw-bold display-5"
        >
          Edit User
        </h1>
      </div>
      <div class="row mt-4 mb-5">
        <h1 class="offset-sm-2 offset-md-3 offset-xl-4 col-auto fs-3">
          ${() => user().email || ""}
        </h1>
        <div class="position-relative offset-sm-2 offset-md-3 offset-xl-4">
          <img
            class="position-absolute"
            src="assets/images/users/profile_icon.svg"
            alt="Profile Icon"
            style="
                  width: 150px;
                  top: -115px;  /* Pulls icon up: -(icon_height / 2) to center on container's top edge */
                  left: -75px; 
                  transform: translateX(-50%); /* Center the icon at the 'left' point */
                  filter: drop-shadow(10px 13px 9px rgba(0, 0, 0, 0.35));
                  z-index: 10; /* Ensure it's above other content */
                "
          />
        </div>
      </div>
      <${Show} when=${() => !roles.loading && !userData.loading}>
        <form onSubmit=${handleSubmit} class="mb-5">
          <div class="row align-items-center mb-2">
            <!-- Account Type -->
            <label
              class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-3 col-xl-2 align-self-center col-form-label form-label-user fw-semibold"
              >Account Type</label
            >
            <div class="col-sm-3 col-xl-2">
              <div>NIH</div>
            </div>
          </div>
          <div class="row align-items-center mb-2">
            <!-- Email -->
            <label
              for="email"
              class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-3 col-xl-2 align-self-center col-form-label form-label-user fw-semibold"
              >Email</label
            >
            <div class="col-sm-3 col-xl-2">
              <div>${() => user().email || ""}</div>
            </div>
          </div>
          <div class="row align-items-center mb-2">
            <!-- First Name -->
            <label
              for="firstName"
              class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-3 col-xl-2 align-self-center col-form-label form-label-user fw-semibold"
              >First Name</label
            >
            <div class="col-sm-3 col-xl-2">
              <input
                type="text"
                class="form-control"
                id="firstName"
                value=${() => user().firstName || ""}
                onInput=${(e) => handleInputChange("firstName", e.target.value)}
                placeholder="Enter first name"
              />
            </div>
          </div>
          <div class="row align-items-center mb-2">
            <!-- Last Name -->
            <label
              for="lastName"
              class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-3 col-xl-2 align-self-center col-form-label form-label-user fw-semibold"
              >Last Name</label
            >
            <div class="col-sm-3 col-xl-2">
              <input
                type="text"
                class="form-control"
                id="lastName"
                value=${() => user().lastName || ""}
                onInput=${(e) => handleInputChange("lastName", e.target.value)}
                placeholder="Enter last name"
              />
            </div>
          </div>
          <div class="row align-items-center mb-2">
            <!-- Status -->
            <label
              for="status"
              class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-3 col-xl-2 align-self-center col-form-label form-label-user fw-semibold"
              >Status<span class="text-danger">*</span></label
            >
            <div class="col-sm-3 col-xl-2">
              <select
                class="form-select"
                id="status"
                value=${() => user().status || "active"}
                onChange=${(e) => handleInputChange("status", e.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div class="row align-items-center mb-2">
            <!-- Role -->
            <label
              for="roleId"
              class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-3 col-xl-2 align-self-center col-form-label form-label-user fw-semibold"
              >Role</label
            >
            <div class="col-sm-3 col-xl-2">
              <select
                class="form-select"
                id="roleId"
                value=${() => user().roleId || ""}
                onChange=${(e) => handleRoleChange(parseInt(e.target.value))}
              >
                ${() =>
                  roles()?.map(
                    (role) => html`
                      <option value=${role.id} selected=${() => role.id === user().roleId}>
                        ${capitalize(role.name)}
                      </option>
                    `
                  )}
              </select>
            </div>
          </div>
          <div class="row align-items-center mb-2">
            <!-- Weekly Cost Limit -->
            <label
              for="limit"
              class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-3 col-xl-2 align-self-start col-form-label form-label-user fw-semibold"
              >Weekly Cost Limit ($)</label
            >
            <div class="col-sm-3 col-xl-2">
              <div class="form-check form-switch my-2">
                <input
                  class="form-check-input"
                  type="checkbox"
                  id="noLimitCheckbox"
                  checked=${() => user().noLimit}
                  onChange=${(e) => handleNoLimitChange(e.target.checked)}
                  aria-label="Unlimited checkbox"
                />
                <label class="form-check-label" for="noLimitCheckbox">Unlimited</label>
              </div>

              <div class="input-group mb-2">
                <span class="input-group-text">$</span>
                <input
                  type="number"
                  step="5"
                  min="0"
                  class="form-control"
                  disabled=${() => user().noLimit}
                  id="limit"
                  value=${() => user().limit || 0}
                  onInput=${(e) => handleInputChange("limit", parseInt(e.target.value) || 0)}
                  aria-label="Weekly cost limit"
                />
                <${Show} when=${() => params.id}>
                  <button
                    type="button"
                    disabled=${() => user().noLimit}
                    class="btn btn-outline-primary"
                    onClick=${() => {
                      setUser((prev) => ({
                        ...prev,
                        limit: DEFAULT_ROLE_LIMITS[prev.roleId]?.limit,
                        noLimit: DEFAULT_ROLE_LIMITS[prev.roleId]?.noLimit,
                      }));
                    }}
                  >
                    Reset
                  </button>
                <//>
              </div>
            </div>
          </div>

          <div class="row">
            <!-- Form Buttons -->
            <div class="col-12 mt-4">
              <div class="d-flex gap-2 justify-content-center">
                <a
                  href="/_/users"
                  class="btn btn-outline-secondary text-decoration-none btn-uniform"
                >
                  Cancel
                </a>
                <button type="submit" class="btn btn-primary btn-uniform" disabled=${saving}>
                  ${() => (saving() ? "Saving..." : "Save")}
                </button>
              </div>
            </div>
          </div>
        </form>
      <//>
    </div>
  `;
}

export default UserEdit;
