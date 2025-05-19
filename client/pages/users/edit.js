import { createSignal, Show } from "solid-js";
import html from "solid-js/html";
import { useParams } from "@solidjs/router";
import { createResource } from "solid-js";

function UserEdit() {
  const params = useParams();
  const isNewUser = params.id === "new";
  
  const [user, setUser] = createSignal({
    email: "",
    firstName: "",
    lastName: "",
    status: "pending",
    roleId: null,
    limit: 0,
    remaining: 0
  });
  
  const [generateApiKey, setGenerateApiKey] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  
  // Fetch roles data using resource
  const [roles] = createResource(() => 
    fetch("/api/admin/roles").then(res => res.json())
  );
  
  // Fetch user data if editing existing user
  const [userData] = createResource(() => {
    if (isNewUser) return null;
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
      if (!isNewUser) {
        userData.id = params.id;
      }
      
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
      
      window.location.href = "/users";
    } catch (err) {
      console.error("Error saving user:", err);
      alert(err.message || "An error occurred while saving the user");
    } finally {
      setSaving(false);
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
    <div class="container py-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="font-title text-gradient fw-bold my-3">${isNewUser ? "Add New User" : "Edit User"}</h1>
        <div class="d-flex gap-2">
          ${() => !isNewUser && html`
            <a 
              href=${`/user/${params.id}/usage`}
              class="btn btn-outline-secondary btn-sm text-decoration-none">
              View Usage
            </a>
          `}
          <a 
            href="/users"
            class="btn btn-outline-primary btn-sm text-decoration-none">
            Back to Users
          </a>
        </div>
      </div>
      
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
      <${Show} when=${() => !roles.loading && (!isNewUser ? !userData.loading : true)}>
        <div class="card shadow-sm">
          <div class="card-body">
            <form onSubmit=${handleSubmit}>
              <div class="row g-3">
                <!-- Email -->
                <div class="col-md-6">
                  <label for="email" class="form-label">Email</label>
                  <input 
                    type="email" 
                    class="form-control" 
                    id="email" 
                    value=${() => user().email || ''} 
                    onInput=${e => handleInputChange("email", e.target.value)}
                    required />
                </div>
                
                <!-- Role -->
                <div class="col-md-6">
                  <label for="roleId" class="form-label">Role</label>
                  <select 
                    class="form-select" 
                    id="roleId" 
                    value=${() => user().roleId || ''}
                    onChange=${e => handleInputChange("roleId", e.target.value ? parseInt(e.target.value) : null)}>
                    <option value="">Select Role</option>
                    ${() => roles()?.map(role => html`
                      <option value=${role.id}>${role.name}</option>
                    `)}
                  </select>
                </div>
                
                <!-- First Name -->
                <div class="col-md-6">
                  <label for="firstName" class="form-label">First Name</label>
                  <input 
                    type="text" 
                    class="form-control" 
                    id="firstName" 
                    value=${() => user().firstName || ''}
                    onInput=${e => handleInputChange("firstName", e.target.value)} />
                </div>
                
                <!-- Last Name -->
                <div class="col-md-6">
                  <label for="lastName" class="form-label">Last Name</label>
                  <input 
                    type="text" 
                    class="form-control" 
                    id="lastName" 
                    value=${() => user().lastName || ''}
                    onInput=${e => handleInputChange("lastName", e.target.value)} />
                </div>
                
                <!-- Status -->
                <div class="col-md-6">
                  <label for="status" class="form-label">Status</label>
                  <select 
                    class="form-select" 
                    id="status"
                    value=${() => user().status || 'pending'}
                    onChange=${e => handleInputChange("status", e.target.value)}>
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                
                <!-- API Key -->
                <div class="col-md-6">
                  ${() => !isNewUser && user().apiKey && html`
                    <label for="apiKey" class="form-label">API Key</label>
                    <div class="input-group">
                      <input 
                        type="text" 
                        class="form-control font-monospace" 
                        id="apiKey" 
                        value=${() => user().apiKey} 
                        readonly />
                      <button 
                        class="btn btn-outline-secondary" 
                        type="button"
                        onClick=${() => copyToClipboard(user().apiKey)}>
                        Copy
                      </button>
                    </div>
                  `}
                  
                  <div class="form-check mt-2">
                    <input 
                      class="form-check-input" 
                      type="checkbox" 
                      id="generateApiKey"
                      checked=${generateApiKey}
                      onChange=${e => setGenerateApiKey(e.target.checked)} />
                    <label class="form-check-label" for="generateApiKey">
                      ${() => user().apiKey ? "Regenerate" : "Generate"} API Key
                    </label>
                  </div>
                </div>
                
                <!-- Usage Limits -->
                <div class="col-md-6">
                  <label for="limit" class="form-label">Usage Limit ($)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    class="form-control" 
                    id="limit" 
                    value=${() => user().limit || 0} 
                    onInput=${e => handleInputChange("limit", parseFloat(e.target.value) || 0)} />
                  <div class="form-text">Maximum spending limit for this user</div>
                </div>
                
                <!-- Remaining Balance -->
                <div class="col-md-6">
                  <label for="remaining" class="form-label">Remaining Balance ($)</label>
                  <input 
                    type="number"
                    step="0.01"
                    min="0"
                    class="form-control" 
                    id="remaining" 
                    value=${() => user().remaining || 0} 
                    onInput=${e => handleInputChange("remaining", parseFloat(e.target.value) || 0)} />
                  <div class="form-text">Current remaining balance</div>
                </div>
                
                <!-- Form Buttons -->
                <div class="col-12 mt-4">
                  <div class="d-flex gap-2 justify-content-end">
                    <a 
                      href="/users"
                      class="btn btn-outline-secondary text-decoration-none">
                      Cancel
                    </a>
                    <button 
                      type="submit" 
                      class="btn btn-primary" 
                      disabled=${saving}>
                      ${() => saving() ? "Saving..." : "Save User"}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      <//>
    </div>
  `;
}

export default UserEdit;