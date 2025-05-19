import { For, Show } from "solid-js";
import { createResource } from "solid-js";
import html from "solid-js/html";

function UsersList() {
  const [users] = createResource(() => fetch("/api/admin/users").then(res => res.json()));
  const [roles] = createResource(() => fetch("/api/admin/roles").then(res => res.json()));
  
  function formatDate(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  }

  return html`
    <div class="container py-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="font-title text-gradient fw-bold my-3">User Management</h1>
        <a href="/user/new" class="btn btn-outline-primary btn-sm text-decoration-none">
          Add New User
        </a>
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
          <table class="table table-hover mb-0">
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Name</th>
                <th>Status</th>
                <th>Role</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <${For} each=${users}>
                ${user => html`
                <tr>
                  <td>${user.id}</td>
                  <td>${user.email || '-'}</td>
                  <td>${user.firstName || ''}${' '}${user.lastName || ''}</td>
                  <td>
                    <span class=${() => 
                      user.status === "active" ? "badge text-bg-success" : 
                      user.status === "pending" ? "badge text-bg-warning" : 
                      "badge text-bg-danger"
                    }>
                      ${user.status || 'unknown'}
                    </span>
                  </td>
                  <td>${() => user.Role?.name || "No Role"}</td>
                  <td>${formatDate(user.createdAt)}</td>
                  <td>
                    <div class="btn-group btn-group-sm">
                      <a
                        href=${`/user/${user.id}`}
                        class="btn btn-outline-primary text-decoration-none">
                        Edit
                      </a>
                      <a
                        href=${`/user/${user.id}/usage`}
                        class="btn btn-outline-secondary text-decoration-none">
                        Usage
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