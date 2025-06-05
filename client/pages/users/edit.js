import { createSignal, Show } from "solid-js";
import html from "solid-js/html";
import { useParams, useLocation } from "@solidjs/router";
import { createResource } from "solid-js";
import { capitalize } from "../../utils/utils.js";

function UserEdit() {
  const params = useParams();
  const location = useLocation();
  const isProfileRoute = location.pathname.includes("/profile/");
  
  const [user, setUser] = createSignal({
    email: "",
    firstName: "",
    lastName: "",
    status: "active",
    roleId: 3,
    limit: 0,
    remaining: 0
  });
  
  const [generateApiKey, setGenerateApiKey] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [showSuccess, setShowSuccess] = createSignal(false);
  
  // Fetch roles data using resource
  const [roles] = createResource(() => 
    fetch("/api/admin/roles").then(res => res.json())
  );
  
  // Fetch user data if editing existing user
  const [userData] = createResource(() => {
    return fetch(`/api/admin/users/${params.id}`)
      .then(res => res.json())
      .then(data => {
        setUser(data);
        return data;
      });
  });
  
  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    
    try {
      const userData = { ...user() };
      
      // Include ID if editing existing user
      userData.id = params.id;
      
      // Include generateApiKey flag if checked
      if (generateApiKey()) {
        userData.generateApiKey = true;
      }
      
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData)
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save user");
      }
      
    } catch (err) {
      console.error("Error saving user:", err);
      alert(err.message || "An error occurred while saving the user");
    } finally {
      setSaving(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  }
  
  function handleInputChange(field, value) {
    setUser(prev => ({ ...prev, [field]: value }));
  }
  
  function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
      .then(() => {
        alert("API Key copied to clipboard!");
      })
      .catch(err => {
        console.error("Could not copy text: ", err);
      });
  }

  return html`
    <div class="position-relative">
      <img src="assets/images/users/profile_banner.png" alt="Profile Management Banner" class="img-fluid object-fit-cover w-100" style="height:153px;" />
      <div class="position-absolute" style="left: 36% !important; top: 40% !important;">
          <h1 class="font-title text-white text-end fw-bold display-5" >${isProfileRoute ? "User Profile" : "Edit User"}</h1>
      </div>
      <div class="position-absolute" style="left: 25% !important; top: 55% !important;">
          <img src="assets/images/users/profile_icon.svg" alt="Profile Icon" style="filter:drop-shadow(10px 13px 9px rgba(0, 0, 0, 0.35));"/>
      </div>
    </div>
    <div class="container pb-4">
      <!-- Success Banner -->
      <${Show} when=${showSuccess}>
        <div class="alert alert-success alert-dismissible fade show position-absolute top-0 start-50 translate-middle-x mt-3" role="alert">
          <strong>Success!</strong> All changes have been saved.
          <button type="button" class="btn-close" onClick=${() => setShowSuccess(false)} aria-label="Close"></button>
        </div>
      </>
      <!-- Error Alert -->
      <${Show} when=${() => roles.error || userData.error}>
        <div class="alert alert-danger" role="alert">
          ${() => (roles.error || userData.error || "An error occurred while fetching data")}
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
      <div class="row mt-4 mb-5">
        <h1 class="offset-sm-4 col-sm-1_5 fs-3">${() => user().email || ''} </h1>
      </div>
      <${Show} when=${() => !roles.loading && !userData.loading}>
        <form onSubmit=${handleSubmit} class="mb-5">
          <div class="row align-items-center mb-2">
            <!-- Account Type -->
            <label class="offset-sm-4 col-sm-1_5 align-self-center col-form-label form-label-user fw-semibold">Account Type</label>
            <div class="col-sm-2">
              <div> 
                NIH
              </div>
            </div>
          </div>
          <div class="row align-items-center mb-2">
            <!-- Email -->
            <label for="email" class="offset-sm-4 col-sm-1_5 align-self-center col-form-label form-label-user fw-semibold">Email</label>
            <div class="col-sm-2">
              <div>
                ${() => user().email || ''} 
              </div>
            </div>
          </div>
          <div class="row align-items-center mb-2">
            <!-- Name -->
            <label for="name" class="offset-sm-4 col-sm-1_5 align-self-center col-form-label form-label-user fw-semibold">Name</label>
            <div class="col-sm-2">
              <div> 
                ${() => user().firstName + ' ' + user().lastName || ''}
              </div>
            </div>
          </div>
          <div class="row align-items-center mb-2">
            <!-- Status -->
            <label for="status" class="offset-sm-4 col-sm-1_5 align-self-center col-form-label form-label-user fw-semibold">Status<span class="text-danger">*</span></label>
            <div class="col-sm-2">
              <${Show} when=${!isProfileRoute} fallback=${
                html`
                  <div class="text-capitalize"> 
                    ${() => user().status}
                  </div>
                `
              }>
                <select 
                  class="form-select" 
                  id="status"
                  value=${() => user().status || 'active'}
                  onChange=${e => handleInputChange("status", e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              <//>
            </div>
          </div>
          <div class="row align-items-center mb-2">
            <!-- Role -->
            <label for="roleId" class="offset-sm-4 col-sm-1_5 align-self-center col-form-label form-label-user fw-semibold">Role</label>
            <div class="col-sm-2">
              <${Show} when=${!isProfileRoute} fallback=${
                html`
                  <div class="text-capitalize"> 
                    ${() => user().Role?.name}
                  </div>
                `
              }>
                <select 
                  class="form-select" 
                  id="roleId" 
                  value=${() => user().roleId || ''}
                  onChange=${e => handleInputChange("roleId", e.target.value ? parseInt(e.target.value) : null)}>
                  ${() => roles()?.map(role => html`
                    <option value=${role.id} selected=${() => role.id === user().roleId}>${capitalize(role.name)}</option>
                  `)}
                </select>
              <//>
            </div>
          </div>
          <div class="row align-items-center mb-2">
            <!-- Cost Threshold -->
            <label for="limit" class="offset-sm-4 col-sm-1_5 align-self-center col-form-label form-label-user fw-semibold">Cost Threshold ($)</label>
            <div class="col-sm-2">
            <${Show} when=${!isProfileRoute} fallback=${
                html`
                  <div> 
                    ${() => user().limit}
                  </div>
                `
              }>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  class="form-control" 
                  id="limit" 
                  value=${() => user().limit || 0} 
                  onInput=${e => handleInputChange("limit", parseFloat(e.target.value) || 0)} />
            <//>
            </div>
          </div>
          
          <${Show} when=${!isProfileRoute}>
            <div class="row">
              <!-- Form Buttons -->
              <div class="col-12 mt-4">
                <div class="d-flex gap-2 justify-content-center">
                  <a 
                    href="/users"
                    class="btn btn-outline-secondary text-decoration-none">
                    Cancel
                  </a>
                  <button 
                    type="submit" 
                    class="btn btn-primary" 
                    disabled=${saving}>
                    ${() => saving() ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          <//>
        </form>
      <//>
    </div>
  `;
}

export default UserEdit;