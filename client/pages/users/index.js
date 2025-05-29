import { createSignal, createEffect, createMemo, For, Show } from "solid-js";
import { createResource } from "solid-js";
import html from "solid-js/html";

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}


function UsersList() {
  const [users] = createResource(() => fetch("/api/admin/users").then(res => res.json()));
  const [roles] = createResource(() => fetch("/api/admin/roles").then(res => res.json()));
  
  const [selectedRole, setSelectedRole] = createSignal("All");
  const [selectedStatus, setSelectedStatus] = createSignal("All");
  
  const roleNames = createMemo(() => roles()?.map(role => role.name) || []);
  const statuses = createMemo(() => users()?.map(user => user.status) || []);
  const filteredUsers = createMemo(() => {
  if (!users()) return [];
  return users().filter(user => {
    const roleMatch = selectedRole() === "All" || user.Role?.name === selectedRole();
    const statusMatch = selectedStatus() === "All" || user.status === selectedStatus();
    return roleMatch && statusMatch;
  });
});


  return html`
    <div class="container py-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="font-title text-gradient fw-bold my-3">Manage Users</h1>
      </div>
      
      <!-- Error Alert -->
      <${Show} when=${() => users.error || roles.error}>
        <div class="alert alert-danger" role="alert">
          ${() => (users.error || roles.error || "An error occurred while fetching data")}
        </div>
      <//>
      
      <!-- Loading State -->
      <${Show} when=${() => users.loading || roles.loading}>
        <div class="d-flex justify-content-center my-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>
      <//>
      
      <!-- Users Table -->
      <${Show} when=${() => !users.loading && users()?.length > 0}>
        <div class="table-responsive">
        <div class="row my-2">
            <label for="role" class="col-sm-auto col-form-label">Role</label>
            <div class="col-sm-2">
              <select 
                class="form-select" 
                id="role" 
                aria-label="Select Role Filter"
                onInput=${e => setSelectedRole(e.target.value)}
                >
                  <option selected> All </option>
                  <${For} each=${() => roleNames()}>
                    ${role => html`<option value=${role}>${capitalize(role)}</option>`}
                  <//>
              </select>
            </div>
            <label for="status" class="col-sm-auto col-form-label">Status</label>
            <div class="col-sm-2">
              <select 
                class="form-select" 
                id="status" 
                aria-label="Select status Filter"
                onInput=${e => setSelectedStatus(e.target.value)}
                >
                  <option selected> All </option>
                  <${For} each=${() => statuses()}>
                    ${status => html`<option value=${status}>${capitalize(status)}</option>`}
                  <//>
              </select>
            </div>
        </div>

          <table class="table table-hover mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Account Type</th>
                <th>Email</th>
                <th>Status</th>
                <th>Role</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <${For} each=${filteredUsers}>
                ${user => html`
                <tr>
                  <td>${user.firstName || ''}${' '}${user.lastName || ''}</td>
                  <td>NIH</td>
                  <td>${user.email || '-'}</td>
                  <td>
                    <span class=${() => 
                      `badge text-capitalize ${
                        user.status === "active" ? "text-bg-success" : 
                        user.status === "pending" ? "text-bg-warning" : 
                        "text-bg-danger"
                      }`
                    }>
                      ${user.status || 'unknown'}
                    </span>
                  </td>
                  <td class="text-capitalize">${() => user.Role?.name || "No Role"}</td>
                  <td>
                      <a
                        href=${`/user/${user.id}`}
                        class="btn btn-outline-primary text-decoration-none">
                        Edit
                      </a>
                    </div>
                  </td>
                </tr>
                `}
              <//>
            </tbody>
          </table>
        </div>
      <//>
      
      <!-- No Users Message -->
      <${Show} when=${() => !users.loading && (!users() || users().length === 0)}>
        <div class="alert alert-info">
          No users found. Click "Add New User" to create one.
        </div>
      <//>
    </div>
  `;
}

export default UsersList;