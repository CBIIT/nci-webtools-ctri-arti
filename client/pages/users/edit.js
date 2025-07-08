import { createSignal, Show } from "solid-js";
import html from "solid-js/html";
import { useParams } from "@solidjs/router";
import { createResource } from "solid-js";
import { capitalize } from "/utils/utils.js";

function UserEdit() {
  const params = useParams();
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
  const [originalUser, setOriginalUser] = createSignal({ ...user() });
  const [generateApiKey, setGenerateApiKey] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [showSuccess, setShowSuccess] = createSignal(false);
  const [resetMessage, setResetMessage] = createSignal("");
  const [showResetMessage, setShowResetMessage] = createSignal(false);

  const ADMIN_ROLE_ID = 1;

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
        setOriginalUser(data);
        data.limit = data.limit !== null ? formatLimitForDisplay(data.limit) : data.limit;
        setUser(data);
        return data;
      });
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    try {
      const userData = { ...user() };
      userData.limit = parseFloat(userData.limit);
      // Handle no limit case - send null for limit when noLimit is true
      if (userData.noLimit) {
        userData.limit = null;
      }
      // Track differences in limit to adjust remaining accordingly even if limit becomes null
      if (parseFloat(originalUser().limit) !== userData.limit) {
        const limitDiff = (userData.limit || 0) - (parseFloat(originalUser().limit) || 0);
        userData.remaining = (parseFloat(userData.remaining) || 0) + limitDiff;
      }

      // Include generateApiKey flag if checked
      if (generateApiKey()) {
        userData.generateApiKey = true;
      }

      const apiPayload = { ...userData };
      // Include ID for user being edited
      apiPayload.id = params.id;
      // Remove the UI-only property
      delete apiPayload.noLimit; 

      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save user");
      }
      setOriginalUser(userData);
      userData.limit = userData.limit !== null ? formatLimitForDisplay(userData.limit) : userData.limit;
      setUser(userData);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving user:", err);
      alert(err.message || "An error occurred while saving the user");
    } finally {
      setSaving(false);
    }
  }

  function handleRoleChange(roleId) {
    // Simply update the role ID without changing limit settings
    setUser((prev) => ({ ...prev, roleId }));
    if (roleId === ADMIN_ROLE_ID) {
      setUser((prev) => ({
        ...prev,
        noLimit: true,
        limit: null,
      }));
    } else {
      setUser((prev) => ({
        ...prev,
        noLimit: false,
        limit: prev.limit === null ? formatLimitForDisplay(originalUser().limit || 5) : prev.limit,
      }));
    }
  }

  function handleInputChange(field, value) {
    setUser((prev) => ({ ...prev, [field]: value }));
  }

  function handleNoLimitChange(checked) {
    setUser((prev) => ({
      ...prev,
      noLimit: checked,
      limit: checked ? null : formatLimitForDisplay(originalUser().limit || 5),
    }));
  }

  function formatLimitForDisplay(value) {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      return num.toFixed(2);
    }
    return 0.00.toFixed(2);
  }

  // Format limit to two decimal places on blur to ensure consistent formatting
  function handleLimitBlur() {
    const formattedValue = formatLimitForDisplay(user().limit);
    handleInputChange("limit", formattedValue);
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
  
  // Function to reset a user's weekly limit
  async function resetUserLimit() {
    try {
      const response = await fetch(`/api/admin/users/${params.id}/reset-limit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to reset user limit");
      }
      
      const data = await response.json();
      
      // Update the user data with the reset values
      setUser(prev => ({ ...prev, remaining: data.user.remaining }));
      
      // Show success message
      setResetMessage("Weekly limit has been reset successfully.");
      setShowResetMessage(true);
      setTimeout(() => setShowResetMessage(false), 3000);
      
    } catch (err) {
      console.error("Error resetting user limit:", err);
      alert(err.message || "An error occurred while resetting the user limit");
    }
  }

  return html`
    <img
      src="assets/images/users/profile_banner.png"
      alt="Profile Management Banner"
      class="img-fluid object-fit-cover w-100"
      style="height:153px;" />
    <div class="container pb-4">
      <!-- Success Banner -->
      <${Show} when=${showSuccess}>
        <div class="alert alert-success alert-dismissible fade show position-absolute top-0 start-50 translate-middle-x mt-3" role="alert">
          <strong>Success!</strong> All changes have been saved.
          <button type="button" class="btn-close" onClick=${() => setShowSuccess(false)} aria-label="Close"></button>
        </div>
      <//>
      
      <!-- Reset Success Banner -->
      <${Show} when=${showResetMessage}>
        <div class="alert alert-success alert-dismissible fade show position-absolute top-0 start-50 translate-middle-x mt-3" role="alert">
          <strong>Success!</strong> ${resetMessage}
          <button type="button" class="btn-close" onClick=${() => setShowResetMessage(false)} aria-label="Close"></button>
        </div>
      <//>
      <!-- Error Alert -->
      <${Show} when=${() => roles.error || userData.error}>
        <div class="alert alert-danger" role="alert">${() => roles.error || userData.error || "An error occurred while fetching data"}</div>
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
        <h1 class="offset-sm-2 offset-md-3 offset-xl-4 col-auto font-title text-white fw-bold display-5">Edit User</h1>
      </div>
      <div class="row mt-4 mb-5">
        <h1 class="offset-sm-2 offset-md-3 offset-xl-4 col-auto fs-3">${() => user().email || ""}</h1>
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
                " />
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
                placeholder="Enter first name" />
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
                placeholder="Enter last name" />
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
                onChange=${(e) => handleInputChange("status", e.target.value)}>
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
                onChange=${(e) => handleRoleChange(parseInt(e.target.value))}>
                ${() =>
                  roles()?.map(
                    (role) => html` <option value=${role.id} selected=${() => role.id === user().roleId}>${capitalize(role.name)}</option> `
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
                  aria-label="Unlimited checkbox" />
                <label class="form-check-label" for="noLimitCheckbox">Unlimited</label>
              </div>

              <div class="input-group mb-2">
                <span class="input-group-text">$</span>
                <input
                  type="text"
                  inputmode="decimal" 
                  class="form-control"
                  disabled=${() => user().noLimit}
                  id="limit"
                  value=${() => user().limit ?? ""}
                  onInput=${(e) => handleInputChange("limit", e.target.value)}
                  onBlur=${handleLimitBlur}
                  aria-label="Weekly cost limit"
                />
                <${Show} when=${() => params.id}>
                  <button 
                    type="button" 
                    disabled=${() => user().noLimit}
                    class="btn btn-outline-primary"
                    onClick=${resetUserLimit}>
                    Reset
                  </button>
                <//>
              </div>
              <div class="small text-muted">
                Remaining: $${() =>
                  !user().noLimit && user().remaining !== null
                    ? Math.max(0, parseFloat(user().remaining)).toFixed(2)
                    : "N/A"}
              </div>
            </div>
          </div>

          
          <div class="row">
            <!-- Form Buttons -->
            <div class="col-12 mt-4">
              <div class="d-flex gap-2 justify-content-center">
                <a href="/_/users" class="btn btn-outline-secondary text-decoration-none"> Cancel </a>
                <button type="submit" class="btn btn-primary" disabled=${saving}>${() => (saving() ? "Saving..." : "Save")}</button>
              </div>
            </div>
          </div>
        </form>
      <//>
    </div>
  `;
}

export default UserEdit;
