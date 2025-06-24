import { createSignal, createEffect, createMemo, For, Show } from "solid-js";
import { createResource } from "solid-js";
import html from "solid-js/html";
import { capitalize } from "/utils/utils.js";

// Helper function (can be at the top level or inside UsersList if preferred)
const range = (start, end) => {
  const length = end - start + 1;
  return Array.from({ length }, (_, i) => start + i);
};

function UsersList() {
  // Date range options for filtering
  const dateRangeOptions = ["This Week", "Last 30 Days", "Last 60 Days", "Last 120 Days", "Last 360 Days"];
  const [selectedDateRange, setSelectedDateRange] = createSignal("This Week");
  
  // Create resource for fetching user usage data
  const [usageResource] = createResource(
    () => selectedDateRange(),
    (dateRange) => fetch(`/api/admin/usage?dateRange=${encodeURIComponent(dateRange)}`)
      .then(res => res.json())
  );
  
  const [rolesResource] = createResource(() => fetch("/api/admin/roles").then(res => res.json()));
  
  // --- Filters & Sorting ---
  const [searchQuery, setSearchQuery] = createSignal("");
  const [selectedRole, setSelectedRole] = createSignal("All");
  const [sortColumn, setSortColumn] = createSignal("estimatedCost");
  const [sortOrder, setSortOrder] = createSignal("desc");

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
    if (!usageResource()?.users) return [];
    return usageResource().users.filter(user => {
      const roleMatch = selectedRole() === "All" || user.role === selectedRole();
      const searchMatch = !searchQuery() || 
        user.name.toLowerCase().includes(searchQuery().toLowerCase()) || 
        user.email.toLowerCase().includes(searchQuery().toLowerCase());
      return roleMatch && searchMatch;
    });
  });
  
  const sortedUsers = createMemo(() => {
    const usersToSort = filteredUsers();
    
    if (!usersToSort || usersToSort.length === 0) {
      return [];
    }
    const column = sortColumn(); 
    const order = sortOrder();   
    
    return [...usersToSort].sort((a, b) => {
      let valA = a[column];
      let valB = b[column];
      
      let comparison = 0;
      
      // Special handling for numeric columns displayed as strings
      if (column === "estimatedCost" || column === "weeklyCostLimit") {
        // For weeklyCostLimit, handle "No limit" case
        if (column === "weeklyCostLimit") {
          const numA = valA === "No limit" ? Infinity : parseFloat(valA) || 0;
          const numB = valB === "No limit" ? Infinity : parseFloat(valB) || 0;
          comparison = numA - numB;
        } else {
          comparison = (parseFloat(valA) || 0) - (parseFloat(valB) || 0);
        }
      } else if (typeof valA === "number" && typeof valB === "number") {
        comparison = (valA || 0) - (valB || 0);
      } else {
        // String comparison for non-numeric values
        const strA = String(valA || "").toLowerCase();
        const strB = String(valB || "").toLowerCase();
        comparison = strA.localeCompare(strB);
      }

      return order === "asc" ? comparison : -comparison;
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
        <h1 class="font-title fs-1 fw-bold mt-4 table-header-color">AI Usage Dashboard</h1>
      </div>
      
      <!-- Error Alert -->
      <${Show} when=${() => usageResource.error || rolesResource.error}>
        <div class="alert alert-danger" role="alert">
          ${() => (usageResource.error || rolesResource.error || "An error occurred while fetching data")}
        </div>
      <//>
      
      <!-- Loading State -->
      <${Show} when=${() => usageResource.loading || rolesResource.loading}>
        <div class="d-flex justify-content-center my-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>
      <//>

      <!-- Filters -->
      <div class="row my-3 align-items-center mx-1">
        <div class="col-md-4 mb-2 mb-md-0">
          <div class="input-group">
            <span class="input-group-text">Search</span>
            <input 
              type="text" 
              class="form-control" 
              placeholder="Search by name or email"
              value=${searchQuery()}
              onInput=${e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <label for="role-filter" class="col-auto col-form-label fw-semibold">Role</label>
        <div class="col-md-2 mb-2 mb-md-0">
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
        
        <label for="date-range-filter" class="col-auto col-form-label fw-semibold">Date Range</label>
        <div class="col-md-2">
          <select 
            class="form-select" 
            id="date-range-filter" 
            value=${selectedDateRange()}
            aria-label="Select Date Range"
            onInput=${e => setSelectedDateRange(e.target.value)}
            >
              <${For} each=${dateRangeOptions}>
                ${range => html`<option value=${range}>${range}</option>`}
              <//>
          </select>
        </div>
      </div>

      <!-- Users Table -->
      <${Show} when=${() => !usageResource.loading && usageResource()?.users?.length > 0}>
        <div class="table-responsive rounded users-table">
          <table class="table table-striped table-hover mb-0">
            <thead>
              <tr>
                <th onClick=${() => toggleSort("name")} class="cursor-pointer ps-4">
                  User ${() => sortColumn() === "name" ? (sortOrder() === "asc" ? "↑" : "↓") : ""}
                </th>
                <th onClick=${() => toggleSort("email")} class="cursor-pointer">
                  Email ${() => sortColumn() === "email" ? (sortOrder() === "asc" ? "↑" : "↓") : ""}
                </th>
                <th onClick=${() => toggleSort("role")} class="cursor-pointer">
                  User Role ${() => sortColumn() === "role" ? (sortOrder() === "asc" ? "↑" : "↓") : ""}
                </th>
                <th onClick=${() => toggleSort("inputTokens")} class="cursor-pointer">
                  Input Tokens ${() => sortColumn() === "inputTokens" ? (sortOrder() === "asc" ? "↑" : "↓") : ""}
                </th>
                <th onClick=${() => toggleSort("outputTokens")} class="cursor-pointer">
                  Output Tokens ${() => sortColumn() === "outputTokens" ? (sortOrder() === "asc" ? "↑" : "↓") : ""}
                </th>
                <th onClick=${() => toggleSort("weeklyCostLimit")} class="cursor-pointer">
                  Weekly Cost Limit ($) ${() => sortColumn() === "weeklyCostLimit" ? (sortOrder() === "asc" ? "↑" : "↓") : ""}
                </th>
                <th onClick=${() => toggleSort("estimatedCost")} class="cursor-pointer">
                  Estimated Cost ($) ${() => sortColumn() === "estimatedCost" ? (sortOrder() === "asc" ? "↑" : "↓") : ""}
                </th>
                <th class="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              <${For} each=${paginatedUsers} fallback=${html`<tr><td colspan="8" class="text-center">No users match current filters.</td></tr>`}>
                ${user => html`
                <tr>
                  <td class="ps-4 small">${user.name}</td>
                  <td class="small">${user.email || '-'}</td>
                  <td class="text-capitalize small">${user.role || "No Role"}</td>
                  <td class="small">${user.inputTokens}</td>
                  <td class="small">${user.outputTokens}</td>
                  <td class="small">${user.weeklyCostLimit}</td>
                  <td class="small">${user.estimatedCost}</td>
                  <td class="text-center">
                    <a
                      href=${`/_/users/${user.id}/usage`}
                      class="btn btn-outline-primary btn-sm text-decoration-none w-100 p-1">
                      View Details
                    </a>
                  </td>
                </tr>
                `}
              <//>
            </tbody>
          </table>
          <div class="table-pagination d-flex justify-content-end align-items-center gap-3">
            <div class="d-flex align-items-center">
              <label for=${`rows-select-${idSuffix}`} class="col-form-label me-2 small">Rows per page:</label>
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
            <div class="text-muted px-1 small">${() => displayedRowsText()}</div>
            <nav aria-label="Page navigation" class="me-4 ms-3">
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
      <${Show} when=${() => !usageResource.loading && (!usageResource()?.users || usageResource().users.length === 0)}>
        <div class="alert alert-info">
          No usage data found for the selected date range.
        </div>
      <//>
      
      <!-- Date Info -->
      <${Show} when=${() => usageResource() && usageResource().users?.length > 0}>
        <div class="mt-3 text-muted small">
          <p>Showing data from ${() => new Date(usageResource().startDate).toLocaleDateString()} to ${() => new Date(usageResource().endDate).toLocaleDateString()}</p>
        </div>
      <//>
    </div>
  `;
}

export default UsersList;