import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  ErrorBoundary,
  For,
  Show,
} from "solid-js";
import html from "solid-js/html";

import { useLocation } from "@solidjs/router";

import { AlertContainer } from "../../components/alert.js";
import { DataTable } from "../../components/table.js";
import {
  alerts,
  clearAlert,
  handleError,
  handleHttpError,
  showError,
  showSuccess,
} from "../../utils/alerts.js";
import { capitalize } from "../../utils/utils.js";

function UsersList() {
  const location = useLocation();
  const [rolesResource] = createResource(async () => {
    try {
      const response = await fetch("/api/admin/roles");
      if (!response.ok) {
        await handleHttpError(response, "fetching roles");
        return [];
      }
      return response.json();
    } catch (err) {
      const error = new Error("Something went wrong while retrieving roles.");
      error.cause = err;
      handleError(error, "Roles API Error");
      return [];
    }
  });

  // Server-side filters & sorting
  const [searchQuery, setSearchQuery] = createSignal("");
  const [selectedRole, setSelectedRole] = createSignal("All");
  const [selectedStatus, setSelectedStatus] = createSignal("active");
  const [sortColumn, setSortColumn] = createSignal("lastName");
  const [sortOrder, setSortOrder] = createSignal("asc");
  const [currentPage, setCurrentPage] = createSignal(1);
  const rowsPerPage = 20;

  const statuses = ["All", "active", "inactive"];

  const roleNames = createMemo(() => {
    const allRoles =
      rolesResource()
        ?.map((role) => role.name)
        .filter(Boolean) || [];
    return ["All", ...new Set(allRoles)];
  });

  // Server-side users resource with all parameters
  const usersParams = createMemo(() => ({
    search: searchQuery().length >= 3 ? searchQuery() : undefined,
    roleId:
      selectedRole() === "All"
        ? undefined
        : rolesResource()?.find((r) => r.name === selectedRole())?.id,
    status: selectedStatus() === "All" ? undefined : selectedStatus(),
    sortBy: sortColumn(),
    sortOrder: sortOrder(),
    limit: rowsPerPage,
    offset: (currentPage() - 1) * rowsPerPage,
  }));

  const [usersResource] = createResource(usersParams, async (params) => {
    try {
      const queryParams = new URLSearchParams({
        limit: params.limit.toString(),
        offset: params.offset.toString(),
      });

      if (params.search) queryParams.set("search", params.search);
      if (params.roleId) queryParams.set("roleId", params.roleId.toString());
      if (params.status) queryParams.set("status", params.status);
      if (params.sortBy) queryParams.set("sortBy", params.sortBy);
      if (params.sortOrder) queryParams.set("sortOrder", params.sortOrder);

      const response = await fetch(`/api/admin/users?${queryParams}`);
      if (!response.ok) {
        await handleHttpError(response, "fetching users");
        return { data: [], meta: { total: 0 } };
      }
      return response.json();
    } catch (err) {
      const error = new Error("Something went wrong while retrieving users.");
      error.cause = err;
      handleError(error, "Users API Error");
      return { data: [], meta: { total: 0 } };
    }
  });

  // Format user data
  const formattedUsers = createMemo(() => {
    if (!usersResource()?.data) return [];
    return usersResource().data.map((user) => ({
      id: user.id,
      name: `${user.lastName || ""}${user.lastName && user.firstName ? ", " : ""}${user.firstName || ""}`,
      accountType: "NIH",
      email: user.email || "-",
      status: user.status || "unknown",
      role: user.Role?.name || "No Role",
      limit: user.limit === null ? "Unlimited" : user.limit,
      rawUser: user,
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

  const handleSort = ({ column, order }) => {
    setSortColumn(column);
    setSortOrder(order);
    setCurrentPage(1);
  };

  const handlePageChange = ({ page }) => {
    setCurrentPage(page);
  };

  // Check for alert message from navigation state
  createEffect(() => {
    const state = location.state;
    if (state?.alertMessage) {
      if (state.alertType === "success") {
        showSuccess(state.alertMessage);
      } else if (state.alertType === "error") {
        showError(state.alertMessage);
      }
      // Clear the state after showing the alert
      window.history.replaceState({}, document.title, location.pathname);
    }
  });

  const isLoading = createMemo(() => usersResource.loading || rolesResource.loading);

  // ============= Error Data Collection =============

  function collectAdditionalErrorData() {
    return {
      "Search Query": searchQuery() || "N/A",
      "Selected Role": selectedRole(),
      "Selected Status": selectedStatus(),
      "Current Page": currentPage(),
      "Sort Column": sortColumn(),
      "Sort Order": sortOrder(),
      "Total Users": usersResource()?.meta?.total || 0,
    };
  }

  return html`
    <${AlertContainer}
      alerts=${alerts}
      onDismiss=${clearAlert}
      onCollectAdditionalData=${collectAdditionalErrorData}
    />
    <${ErrorBoundary}
      fallback=${(error) => {
        handleError(error, "Users List Error");
        return null;
      }}
    >
      <div class="container py-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h1 class="font-title fs-1 fw-bold mt-4 table-header-color">Manage Users</h1>
        </div>

        <!-- Error Alert -->
        <${Show} when=${() => usersResource.error || rolesResource.error}>
          <div class="alert alert-danger" role="alert">
            ${() =>
              usersResource.error || rolesResource.error || "An error occurred while fetching data"}
          </div>
        <//>

        <!-- Filters -->
        <div class="mb-4">
          <div class="row g-3 align-items-center">
            <div class="col-md-3">
              <div class="row align-items-center">
                <div class="col-auto">
                  <label for="search-filter" class="form-label mb-0 fw-semibold px-2">User</label>
                </div>
                <div class="col px-0">
                  <input
                    type="text"
                    class="form-control"
                    id="search-filter"
                    placeholder="Search by name or email"
                    value=${searchQuery}
                    onInput=${(e) => handleSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="row align-items-center">
                <div class="col-auto">
                  <label for="role-filter" class="form-label mb-0 fw-semibold px-2">Role</label>
                </div>
                <div class="col px-0">
                  <select
                    class="form-select"
                    id="role-filter"
                    aria-label="Select Role Filter"
                    value=${selectedRole}
                    onInput=${(e) => handleRoleChange(e.target.value)}
                  >
                    <${For} each=${() => roleNames()}>
                      ${(role) => html`<option value=${role}>${capitalize(role)}</option>`}
                    <//>
                  </select>
                </div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="row align-items-center">
                <div class="col-auto">
                  <label for="status-filter" class="form-label mb-0 fw-semibold px-2">Status</label>
                </div>
                <div class="col px-0">
                  <select
                    class="form-select"
                    id="status-filter"
                    value=${selectedStatus}
                    aria-label="Select Status Filter"
                    onInput=${(e) => handleStatusChange(e.target.value)}
                  >
                    <${For} each=${statuses}>
                      ${(status) =>
                        html`<option value=${status} selected=${selectedStatus() === status}>
                          ${capitalize(status)}
                        </option>`}
                    <//>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Users Table -->
        <${DataTable}
          remote=${true}
          data=${formattedUsers}
          loading=${() => isLoading()}
          loadingText="Loading users..."
          totalItems=${() => usersResource()?.meta?.total || 0}
          page=${currentPage}
          search=${() => (searchQuery().length >= 3 ? searchQuery() : "")}
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
              cellClassName: "ps-4 small",
            },
            {
              key: "accountType",
              title: "Account Type",
              cellClassName: "small",
            },
            {
              key: "email",
              title: "Email",
              cellClassName: "small",
            },
            {
              key: "role",
              title: "Role",
              cellClassName: "text-capitalize small",
            },
            {
              key: "status",
              title: "Status",
              render: (user) => html`
                <span
                  class=${() =>
                    `badge text-capitalize ${
                      user.status === "active"
                        ? "text-bg-success"
                        : user.status === "inactive"
                          ? "text-bg-warning"
                          : "text-bg-danger"
                    }`}
                >
                  ${user.status}
                </span>
              `,
            },
            {
              key: "limit",
              title: "Weekly Cost Limit",
              cellClassName: "text-capitalize small",
            },
            {
              key: "action",
              title: "Action",
              cellClassName: "text-center",
              render: (user) => html`
                <a
                  href=${`/_/users/${user.id}`}
                  class="btn btn-outline-primary btn-sm text-decoration-none w-100 p-1"
                >
                  Edit
                </a>
              `,
            },
          ]}
        />
      </div>
    <//>
  `;
}

export default UsersList;
