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
  const [sortColumn, setSortColumn] = createSignal("lastName");
  const [sortOrder, setSortOrder] = createSignal("asc");
  const [currentPage, setCurrentPage] = createSignal(1);
  const [rowsPerPage, setRowsPerPage] = createSignal(20);
  
  //Should we show from just the available statuses/roles or all of them?
  const roleNames = createMemo(() => {
    const allRoles = roles()?.map(role => role.name).filter(Boolean) || [];
    return [...new Set(allRoles)];
  });

  const statuses = createMemo(() => {
    const allStatuses = users()?.map(user => user.status).filter(Boolean) || [];
    return [...new Set(allStatuses)];
  });
  const filteredUsers = createMemo(() => {
    setCurrentPage(1)
    if (!users()) return [];
      return users().filter(user => {
        const roleMatch = selectedRole() === "All" || user.Role?.name === selectedRole();
        const statusMatch = selectedStatus() === "All" || user.status === selectedStatus();
        return roleMatch && statusMatch;
      });
  });
  
  //Might require a refactor to include Account Type as a sortable field; currently not stored in db
  const sortedUsers = createMemo(() => {
    const users = filteredUsers();
    const column = sortColumn();
    const order = sortOrder();

    return [...users].sort((a, b) => {
      const aValue = (a[column] || a.Role?.name || "").toString().toLowerCase();
      const bValue = (b[column] || b.Role?.name || "").toString().toLowerCase();

      if (aValue < bValue) return order === "asc" ? -1 : 1;
      if (aValue > bValue) return order === "asc" ? 1 : -1;
      return 0;
    });
  });

  function toggleSort(column) {
    if (sortColumn() === column) {
      setSortOrder(sortOrder() === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }
  }

  const paginatedUsers = createMemo(() => {
    const start = (currentPage() - 1) * rowsPerPage();
    const end = start + rowsPerPage();
    return sortedUsers().slice(start, end);
  });
  const totalPages = createMemo(() => Math.ceil(sortedUsers().length / rowsPerPage()));

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

          <table class="table table-striped table-hover mb-0 border border-2">
            <thead class="table-primary">
              <tr>
                <th onClick=${() => toggleSort("lastName")} class="cursor-pointer">
                  Name ${() => sortColumn() === "lastName" ? (sortOrder() === "asc" ? "↑" : "↓") : ""}
                </th>
                <th>Account Type</th>
                <th onClick=${() => toggleSort("email")} class="cursor-pointer">
                  Email ${() => sortColumn() === "email" ? (sortOrder() === "asc" ? "↑" : "↓") : ""}
                </th>
                <th onClick=${() => toggleSort("status")} class="cursor-pointer">
                  Status ${() => sortColumn() === "status" ? (sortOrder() === "asc" ? "↑" : "↓") : ""}
                </th>
                <th onClick=${() => toggleSort("Role.name")} class="cursor-pointer">
                  Role ${() => sortColumn() === "Role.name" ? (sortOrder() === "asc" ? "↑" : "↓") : ""}
                </th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <${For} each=${paginatedUsers}>
                ${user => html`
                <tr>
                  <td>${user.lastName || ''}${', '}${user.firstName || ''}</td>
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
          <div class="d-flex justify-content-end my-3 row">
            <label for="rows-select" class="col-sm-auto col-form-label">Rows per page:</label>
            <div class="col-sm-1">
              <select 
                class="form-select" 
                id="rows-select" 
                onInput=${e => {
                  setRowsPerPage(parseInt(e.target.value));
                  setCurrentPage(1); // reset to first page
                }}
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20" selected>20</option>
                <option value="50">50</option>
              </select>
            </div>
            <nav aria-label="Page navigation example" class="col-sm-auto">
              <ul class="pagination">
                <li class=${() => `page-item ${ currentPage() === 1 ? 'disabled' : ''}`}>
                  <button class="page-link" onClick=${() => currentPage() > 1 && setCurrentPage(currentPage() - 1)}>
                    <span aria-hidden="true">&laquo;</span>
                  </button>
                </li>
                <${For} each=${() => {
                  const total = totalPages();
                  const current = currentPage();
                  const visibleCount = 5; //limit of 5 pagination buttons
                  let start = Math.max(1, current - Math.floor(visibleCount / 2));
                  let end = start + visibleCount - 1;
                  if (end > total) {
                    end = total;
                    start = Math.max(1, end - visibleCount + 1);
                  }
                  const pages = [];
                  for (let i = start; i <= end; i++) {
                    pages.push(i);
                  }
                  return pages;
                }}>
                  ${page => html`
                    <li class=${() => `page-item ${currentPage() === page ? 'active' : ''}`}>
                      <button class="page-link" onClick=${() => setCurrentPage(page)}>
                        ${page}
                      </button>
                    </li>
                  `}
                <//>
                <li class=${() => `page-item ${ currentPage() === totalPages() ? 'disabled' : ''}`}>
                  <button class="page-link" onClick=${() => currentPage() < totalPages() && setCurrentPage(currentPage() + 1)}>
                    <span aria-hidden="true">&raquo;</span>
                  </button>
                </li>
              </ul>
            </nav>
          </div>
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