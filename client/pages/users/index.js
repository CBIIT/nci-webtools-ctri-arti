import { createSignal, createEffect, createMemo, For, Show } from "solid-js";
import { createResource } from "solid-js";
import html from "solid-js/html";
import { capitalize } from "../../utils/utils.js";

// Helper function (can be at the top level or inside UsersList if preferred)
const range = (start, end) => {
  const length = end - start + 1;
  return Array.from({ length }, (_, i) => start + i);
};

function UsersList() {
  const [usersResource] = createResource(() => fetch("/api/admin/users").then(res => res.json()));
  const [rolesResource] = createResource(() => fetch("/api/admin/roles").then(res => res.json()));
  
  // --- Filters & Sorting ---
  const [selectedRole, setSelectedRole] = createSignal("All");
  const [selectedStatus, setSelectedStatus] = createSignal("All");
  const [sortColumn, setSortColumn] = createSignal("lastName");
  const [sortOrder, setSortOrder] = createSignal("asc");

  // --- Pagination State ---
  const [currentPage, setCurrentPage] = createSignal(1);
  const [rowsPerPage, setRowsPerPage] = createSignal(20);
  const rowsPerPageOptions = [5, 10, 20, 50]; 
  const idSuffix = "users";
  //TODO: come back and change this to an endpoint of some sort instead of hard coding values in case we want to add more statuses
  /*
  const statuses = createMemo(() => {
    const allStatuses = usersResource()?.map(user => user.status).filter(Boolean) || [];
    return [...new Set(allStatuses)];
  });*/
  const statuses = ['All', 'active', 'inactive']; //hard coding for now because the above iteration doesn't show *all possible* filters
  
  const roleNames = createMemo(() => {
    const allRoles = rolesResource()?.map(role => role.name).filter(Boolean) || [];
    return ["All", ...new Set(allRoles)];
  });

  const filteredUsers = createMemo(() => {
    if (!usersResource()) return [];
      return usersResource().filter(user => {
        const roleMatch = selectedRole() === "All" || user.Role?.name === selectedRole();
        const statusMatch = selectedStatus() === "All" || user.status === selectedStatus();
        return roleMatch && statusMatch;
      });
  });
  
  //Might require a refactor to include Account Type as a sortable field; currently not stored in db
  const sortedUsers = createMemo(() => {
    const usersToSort = filteredUsers();
    const column = sortColumn();
    const order = sortOrder();

    return [...usersToSort].sort((a, b) => {
      const aValue = (a[column] || a.Role?.name || "").toString().toLowerCase();
      const bValue = (b[column] || b.Role?.name || "").toString().toLowerCase();

      if (aValue < bValue) return order === "asc" ? -1 : 1;
      if (aValue > bValue) return order === "asc" ? 1 : -1;
      return 0;
    });
  });

  createEffect(() => {
    const totalItems = sortedUsers().length;
    const currentTotalPages = Math.ceil(totalItems / rowsPerPage());
    
    if (totalItems === 0) {
        if (currentPage() !== 1) setCurrentPage(1);
    } else if (currentPage() > currentTotalPages) { 
        setCurrentPage(1);
    }
  });

  function toggleSort(column) {
    if (sortColumn() === column) {
      setSortOrder(sortOrder() === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }
    setCurrentPage(1);
  }

  const paginatedUsers = createMemo(() => {
    const start = (currentPage() - 1) * rowsPerPage();
    const end = start + rowsPerPage();
    return sortedUsers().slice(start, end);
  });
  // --- Pagination Logic (integrated from TablePagination) ---
  const totalItemsForPagination = createMemo(() => sortedUsers().length);

  const _totalPages = createMemo(() => {
    if (totalItemsForPagination() === 0) return 1;
    return Math.ceil(totalItemsForPagination() / rowsPerPage());
  });

  const displayedRowsText = createMemo(() => {
    if (totalItemsForPagination() === 0) { return "0–0 of 0"; }
    const startItem = (currentPage() - 1) * rowsPerPage() + 1;
    const endItem = Math.min(currentPage() * rowsPerPage(), totalItemsForPagination());
    return `${startItem}–${endItem} of ${totalItemsForPagination()}`;
  });

  const handleRowsPerPageChange = (e) => {
    const newRowsPerPage = parseInt(e.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setCurrentPage(1); // Always reset to page 1 when RPP changes
  };

  const goToPage = (page) => {
    const newPage = Number(page);
    if (newPage >= 1 && newPage <= _totalPages() && newPage !== currentPage()) {
      setCurrentPage(newPage);
    }
  };

  const pageNumbersToDisplay = createMemo(() => {
    const totalPgs = _totalPages(); 
    const currentPg = currentPage();
    const pageNumbers = [];

    if (totalPgs <= 0) return [1]; 
    if (totalPgs <= 7) { 
      return range(1, totalPgs); 
    }

    pageNumbers.push(1); 
    let middleDynamicStart, middleDynamicEnd;

    if (currentPg <= 4) { 
      middleDynamicStart = 2; middleDynamicEnd = 4;
    } else if (currentPg >= totalPgs - 3) { 
      middleDynamicStart = totalPgs - 3; middleDynamicEnd = totalPgs - 1;
    } else { 
      middleDynamicStart = currentPg - 1; middleDynamicEnd = currentPg + 1; 
    }

    if (middleDynamicStart > 2) { 
      if (middleDynamicStart === 3) { 
        pageNumbers.push(2); 
      } else { 
        pageNumbers.push("..."); 
      } 
    }
    
    for (let i = middleDynamicStart; i <= middleDynamicEnd; i++) { 
      if (i > 1 && i < totalPgs) { 
        if (!pageNumbers.includes(i)) pageNumbers.push(i); 
      } 
    }

    if (middleDynamicEnd < totalPgs - 1) { 
      if (middleDynamicEnd === totalPgs - 2) { 
        if(!pageNumbers.includes(totalPgs - 1)) pageNumbers.push(totalPgs - 1); 
      } else { 
        pageNumbers.push("..."); 
      } 
    }

    if (totalPgs > 1 && !pageNumbers.includes(totalPgs)) { 
      pageNumbers.push(totalPgs); 
    }
    
    const finalUniquePages = []; 
    let lastPushedItem = null;
    for (const item of pageNumbers) { 
      if (item === "..." && lastPushedItem === "...") { continue; } 
      finalUniquePages.push(item); 
      lastPushedItem = item; 
    }
    return finalUniquePages;
  });
  // --- End of Integrated Pagination Logic ---

  return html`
    <div class="container py-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h1 class="font-title fs-1 fw-bold mt-4">Manage Users</h1>
      </div>
      
      <!-- Error Alert -->
      <${Show} when=${() => usersResource.error || rolesResource.error}>
        <div class="alert alert-danger" role="alert">
          ${() => (usersResource.error || rolesResource.error || "An error occurred while fetching data")}
        </div>
      <//>
      
      <!-- Loading State -->
      <${Show} when=${() => usersResource.loading || rolesResource.loading}>
        <div class="d-flex justify-content-center my-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>
      <//>

      <!-- Filters -->
      <div class="row my-3 mx-1">
        <label for="role-filter" class="col-sm-auto col-form-label fw-semibold">Role</label>
        <div class="col-sm-2">
          <select 
            class="form-select" 
            id="role-filter" 
            aria-label="Select Role Filter"
            value=${selectedRole()}
            onInput=${e => setSelectedRole(e.target.value)}
            >
              <${For} each=${() => roleNames()}>
                ${role => html`<option value=${role}>${capitalize(role)}</option>`}
              <//>
          </select>
        </div>
        <label for="status-filter" class="col-sm-auto col-form-label fw-semibold">Status</label>
        <div class="col-sm-2">
          <select 
            class="form-select" 
            id="status-filter" 
            value=${selectedStatus()}
            aria-label="Select status Filter"
            onInput=${e => setSelectedStatus(e.target.value)}
            >
              <${For} each=${statuses}>
                ${status => html`<option value=${status}>${capitalize(status)}</option>`}
              <//>
          </select>
        </div>
      </div>

      <!-- Users Table -->
      <${Show} when=${() => !usersResource.loading && usersResource()?.length > 0}>
        <div class="table-responsive rounded users-table">
          <table class="table table-striped table-hover mb-0">
            <thead>
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
              <${For} each=${paginatedUsers} fallback=${html`<tr><td colspan="6" class="text-center">No users match current filters.</td></tr>`}>
                ${user => html`
                <tr>
                  <td>${user.lastName || ''}${user.lastName && user.firstName ? ', ' : ''}${user.firstName || ''}</td>
                  <td>NIH</td>
                  <td>${user.email || '-'}</td>
                  <td>
                    <span class=${() => 
                      `badge text-capitalize ${
                        user.status === "active" ? "text-bg-success" : 
                        user.status === "inactive" ? "text-bg-warning" : 
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
                  </td>
                </tr>
                `}
              <//>
            </tbody>
          </table>
          <div class="d-flex justify-content-end align-items-center my-3 gap-3">
            <div class="d-flex align-items-center">
              <label for=${`rows-select-${idSuffix}`} class="col-form-label me-2">Rows per page:</label>
              <div>
                <select 
                  class="form-select form-select-sm" 
                  id=${`rows-select-${idSuffix}`} 
                  onInput=${handleRowsPerPageChange}
                >
                  <${For} each=${rowsPerPageOptions}>
                    ${(option) => html`<option value=${option} selected=${() => option === rowsPerPage()}>${option}</option>`}
                  <//>
                </select>
              </div>
            </div>
            <div class="text-muted px-2">${() => displayedRowsText()}</div>
            <nav aria-label="Page navigation">
              <ul class="pagination pagination-sm mb-0">
                <li 
                  classList=${() => ({ 
                    "page-item": true, 
                    "disabled": currentPage() === 1 || totalItemsForPagination() === 0 
                  })}
                >
                  <button class="page-link" onClick=${() => goToPage(currentPage() - 1)} aria-label="Previous">
                    <span aria-hidden="true">«</span>
                  </button>
                </li>
                <${For} each=${pageNumbersToDisplay}>
                  ${(page) => typeof page === "number" 
                    ? html`<li 
                        classList=${() => ({ 
                          "page-item": true, 
                          "active": currentPage() === page 
                        })}
                      >
                        <button class="page-link" onClick=${() => goToPage(page)}>${page}</button>
                      </li>` 
                    : html`<li class="page-item disabled"><span class="page-link">...</span></li>` 
                    /* For ellipsis, classList is static, no function needed if it never changes */
                  }
                <//>
                <li 
                  classList=${() => ({ 
                    "page-item": true, 
                    "disabled": currentPage() === _totalPages() || totalItemsForPagination() === 0 
                  })}
                >
                  <button class="page-link" onClick=${() => goToPage(currentPage() + 1)} aria-label="Next">
                    <span aria-hidden="true">»</span>
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      <//>

      <!-- No Users Message -->
      <${Show} when=${() => !usersResource.loading && (!usersResource() || usersResource().length === 0)}>
        <div class="alert alert-info">
          No users found. Click "Add New User" to create one.
        </div>
      <//>
    </div>
  `;
}

export default UsersList;