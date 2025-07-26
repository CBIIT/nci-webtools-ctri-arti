import { createSignal, createEffect, createMemo, For, Show } from "solid-js";
import { createResource } from "solid-js";
import html from "solid-js/html";
import { capitalize } from "/utils/utils.js";
import { DataTable } from "/components/table.js";


function UsersList() {
  const [rolesResource] = createResource(() => fetch("/api/admin/roles").then(res => res.json()));
  
  // Server-side filters & sorting
  const [searchQuery, setSearchQuery] = createSignal("");
  const [selectedRole, setSelectedRole] = createSignal("All");
  const [selectedStatus, setSelectedStatus] = createSignal("All");
  const [sortColumn, setSortColumn] = createSignal("lastName");
  const [sortOrder, setSortOrder] = createSignal("asc");
  const [currentPage, setCurrentPage] = createSignal(1);
  const rowsPerPage = 20;

  const statuses = ['All', 'active', 'inactive'];
  
  const roleNames = createMemo(() => {
    const allRoles = rolesResource()?.map(role => role.name).filter(Boolean) || [];
    return ["All", ...new Set(allRoles)];
  });

  // Server-side users resource with all parameters
  const usersParams = createMemo(() => ({
    search: searchQuery(),
    roleId: selectedRole() === "All" ? undefined : rolesResource()?.find(r => r.name === selectedRole())?.id,
    status: selectedStatus() === "All" ? undefined : selectedStatus(),
    sortBy: sortColumn(),
    sortOrder: sortOrder(),
    limit: rowsPerPage,
    offset: (currentPage() - 1) * rowsPerPage
  }));

  const [usersResource] = createResource(
    usersParams,
    async (params) => {
      const queryParams = new URLSearchParams({
        limit: params.limit.toString(),
        offset: params.offset.toString()
      });
      
      if (params.search) queryParams.set('search', params.search);
      if (params.roleId) queryParams.set('roleId', params.roleId.toString());
      if (params.status) queryParams.set('status', params.status);
      if (params.sortBy) queryParams.set('sortBy', params.sortBy);
      if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);
      
      const response = await fetch(`/api/admin/users?${queryParams}`);
      return response.json();
    }
  );

  // Format user data
  const formattedUsers = createMemo(() => {
    if (!usersResource()?.data) return [];
    return usersResource().data.map(user => ({
      id: user.id,
      name: `${user.lastName || ''}${user.lastName && user.firstName ? ', ' : ''}${user.firstName || ''}`,
      accountType: "NIH",
      email: user.email || '-',
      status: user.status || 'unknown',
      role: user.Role?.name || "No Role",
      limit: user.limit === null ? "Unlimited" : user.limit,
      rawUser: user
    }));
  });

  // Event handlers
  const handleSearch = (newSearch) => {
    setSearchQuery(newSearch);
    setCurrentPage(1);
  };

  const handleRoleChange = (newRole) => {
    setSelectedRole(newRole);
    setCurrentPage(1);
  };

  const handleStatusChange = (newStatus) => {
    setSelectedStatus(newStatus);
    setCurrentPage(1);
  };

  const handleSort = ({column, order}) => {
    setSortColumn(column);
    setSortOrder(order);
    setCurrentPage(1);
  };

  const handlePageChange = ({page}) => {
    setCurrentPage(page);
  };

  return html`
    <div class="container py-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h1 class="font-title fs-1 fw-bold mt-4 table-header-color">Manage Users</h1>
      </div>
      
      <!-- Error Alert -->
      <${Show} when=${() => usersResource.error || rolesResource.error}>
        <div class="alert alert-danger" role="alert">
          ${() => (usersResource.error || rolesResource.error || "An error occurred while fetching data")}
        </div>
      <//>

      <!-- Filters -->
      <div class="card shadow-sm mb-4">
        <div class="card-body">
          <h5 class="card-title">Filter</h5>
          <div class="row g-3 align-items-end">
            <div class="col-md-3">
              <label for="role-filter" class="form-label">Role</label>
              <select 
                class="form-select" 
                id="role-filter" 
                aria-label="Select Role Filter"
                value=${selectedRole}
                onInput=${e => handleRoleChange(e.target.value)}>
                <${For} each=${() => roleNames()}>
                  ${role => html`<option value=${role}>${capitalize(role)}</option>`}
                <//>
              </select>
            </div>
            <div class="col-md-3">
              <label for="status-filter" class="form-label">Status</label>
              <select 
                class="form-select" 
                id="status-filter" 
                value=${selectedStatus}
                aria-label="Select Status Filter"
                onInput=${e => handleStatusChange(e.target.value)}>
                <${For} each=${statuses}>
                  ${status => html`<option value=${status}>${capitalize(status)}</option>`}
                <//>
              </select>
            </div>
            <div class="col-md-6">
              <div class="input-group">
                <span class="input-group-text">Search</span>
                <input 
                  type="text" 
                  class="form-control" 
                  placeholder="Search by name or email"
                  value=${searchQuery}
                  onInput=${e => handleSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Users Table -->
      <${DataTable}
        remote=${true}
        data=${formattedUsers}
        loading=${() => usersResource.loading || rolesResource.loading}
        loadingText="Loading users..."
        totalItems=${() => usersResource()?.meta?.total || 0}
        page=${currentPage}
        search=${searchQuery}
        sortColumn=${sortColumn}
        sortOrder=${sortOrder}
        onSort=${handleSort}
        onPageChange=${handlePageChange}
        className="users-table"
        columns=${[
          {
            key: "name",
            title: "Name",
            className: "ps-4",
            cellClassName: "ps-4 small"
          },
          {
            key: "accountType",
            title: "Account Type",
            cellClassName: "small"
          },
          {
            key: "email",
            title: "Email",
            cellClassName: "small"
          },
          {
            key: "role",
            title: "Role",
            cellClassName: "text-capitalize small"
          },
          {
            key: "status",
            title: "Status",
            render: (user) => html`
              <span class=${() => 
                `badge text-capitalize ${
                  user.status === "active" ? "text-bg-success" : 
                  user.status === "inactive" ? "text-bg-warning" : 
                  "text-bg-danger"
                }`
              }>
                ${user.status}
              </span>
            `
          },
          {
            key: "limit",
            title: "Weekly Cost Limit",
            cellClassName: "text-capitalize small"
          },
          {
            key: "action",
            title: "Action",
            cellClassName: "text-center",
            render: (user) => html`
              <a
                href=${`/_/users/${user.id}`}
                class="btn btn-outline-primary btn-sm text-decoration-none w-100 p-1">
                Edit
              </a>
            `
          }
        ]}
      />
    </div>
  `;
}

export default UsersList;