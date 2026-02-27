import {
  createMemo,
  createResource,
  createSignal,
  ErrorBoundary,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import html from "solid-js/html";

import { AlertContainer } from "../../components/alert.js";
import { DataTable } from "../../components/table.js";
import { alerts, clearAlert, handleError, handleHttpError } from "../../utils/alerts.js";
import {
  registerErrorDataCollector,
  unregisterErrorDataCollector,
} from "../../utils/global-error-handler.js";
import { capitalize } from "../../utils/utils.js";

// Shared date range utilities
export const VALID_DATE_RANGES = [
  "This Week",
  "Last 30 Days",
  "Last 60 Days",
  "Last 120 Days",
  "Last 360 Days",
  "Custom",
];

// Format date as YYYY-MM-DD
export function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// Get default start date (30 days ago)
export function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return formatDate(date);
}

// Calculate date range from preset
export function calculateDateRange(preset) {
  const now = new Date();
  let startDate, endDate;

  switch (preset) {
    case "This Week": {
      startDate = new Date(now);
      const day = startDate.getDay();
      const diff = day;
      startDate.setDate(startDate.getDate() - diff);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case "Last 30 Days": {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case "Last 60 Days": {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 60);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case "Last 120 Days": {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 120);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case "Last 360 Days": {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 360);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    default: {
      startDate = new Date(now);
      const day = startDate.getDay();
      const diff = day;
      startDate.setDate(startDate.getDate() - diff);
      startDate.setHours(0, 0, 0, 0);
    }
  }

  endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  };
}

// Validate date range from URL params
export function validateDateRange(dateRange, defaultRange = "Last 30 Days") {
  return VALID_DATE_RANGES.includes(dateRange) ? dateRange : defaultRange;
}

function UsersList() {
  const [selectedDateRange, setSelectedDateRange] = createSignal("This Week");
  const [customDates, setCustomDates] = createSignal({
    startDate: getDefaultStartDate(),
    endDate: formatDate(new Date()),
  });

  onMount(() => {
    registerErrorDataCollector("usage", collectAdditionalErrorData);
  });

  onCleanup(() => {
    unregisterErrorDataCollector("usage");
  });

  // Get current date range (either from preset or custom)
  const currentDateRange = createMemo(() => {
    if (selectedDateRange() === "Custom") {
      return customDates();
    }
    return calculateDateRange(selectedDateRange());
  });

  // Create resource for fetching analytics data
  const [_analyticsResource] = createResource(
    () => currentDateRange(),
    ({ startDate, endDate }) =>
      fetch(`/api/v1/admin/analytics?groupBy=user&startDate=${startDate}&endDate=${endDate}`).then(
        (res) => res.json()
      )
  );

  const [rolesResource] = createResource(async () => {
    try {
      const response = await fetch("/api/v1/admin/roles");
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

  // --- Server-side Filters & Sorting ---
  const [searchQuery, setSearchQuery] = createSignal("");
  const [selectedRole, setSelectedRole] = createSignal("All");
  const [selectedStatus, setSelectedStatus] = createSignal("active");
  const [sortColumn, setSortColumn] = createSignal("estimatedCost");
  const [sortOrder, setSortOrder] = createSignal("desc");
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

  // Server-side analytics resource with all parameters
  const analyticsParams = createMemo(() => ({
    startDate: currentDateRange().startDate,
    endDate: currentDateRange().endDate,
    search: searchQuery().length >= 3 ? searchQuery() : undefined,
    role: selectedRole(),
    status: selectedStatus(),
    sortBy: sortColumn(),
    sortOrder: sortOrder(),
    limit: rowsPerPage,
    offset: (currentPage() - 1) * rowsPerPage,
  }));

  // Replace the simple analytics resource with parameterized one
  const [serverAnalyticsResource] = createResource(analyticsParams, async (params) => {
    try {
      const queryParams = new URLSearchParams({
        groupBy: "user",
        startDate: params.startDate,
        endDate: params.endDate,
        limit: params.limit.toString(),
        offset: params.offset.toString(),
      });

      if (params.search) queryParams.set("search", params.search);
      if (params.role && params.role !== "All") queryParams.set("role", params.role);
      if (params.status && params.status !== "All") queryParams.set("status", params.status);
      if (params.sortBy) queryParams.set("sortBy", params.sortBy);
      if (params.sortOrder) queryParams.set("sortOrder", params.sortOrder);

      const response = await fetch(`/api/v1/admin/analytics?${queryParams}`);
      if (!response.ok) {
        await handleHttpError(response, "fetching usage analytics");
        return { data: [], meta: { total: 0 } };
      }
      return response.json();
    } catch (err) {
      const error = new Error("Something went wrong while retrieving usage analytics.");
      error.cause = err;
      error.dateRange = `${params.startDate} to ${params.endDate}`;
      handleError(error, "Analytics API Error");
      return { data: [], meta: { total: 0 } };
    }
  });

  // Format user data from server response
  const formattedUsers = createMemo(() => {
    if (!serverAnalyticsResource()?.data) return [];
    return serverAnalyticsResource().data.map((userStats) => {
      const user = userStats.User;
      const limitDisplay = user.budget === null ? "Unlimited" : `$${user.budget}`;
      const fullName =
        `${user.lastName || ""}, ${user.firstName || ""}`.replace(/^,\s*|,\s*$/g, "").trim() ||
        user.email;

      return {
        id: userStats.userID,
        name: fullName,
        email: user.email,
        role: user.Role?.name || "No Role",
        roleID: user.roleID,
        inputTokens: Math.round(userStats.totalInputTokens || 0),
        outputTokens: Math.round(userStats.totalOutputTokens || 0),
        weeklyCostLimit: limitDisplay,
        estimatedCost: parseFloat((userStats.totalCost || 0).toFixed(2)),
        totalRequests: userStats.totalRequests || 0,
      };
    });
  });

  // Server-side event handlers
  const handleSearch = (newSearch) => {
    setSearchQuery(newSearch);
    setCurrentPage(1); // Reset to first page
  };

  const handleRoleChange = (newRole) => {
    setSelectedRole(newRole);
    setCurrentPage(1); // Reset to first page
  };

  const handleStatusChange = (newStatus) => {
    setSelectedStatus(newStatus);
    setCurrentPage(1); // Reset to first page
  };

  const handleSort = ({ column, order }) => {
    setSortColumn(column);
    setSortOrder(order);
    setCurrentPage(1); // Reset to first page
  };

  const handlePageChange = ({ page }) => {
    setCurrentPage(page);
  };

  const isLoading = createMemo(() => serverAnalyticsResource.loading || rolesResource.loading);

  // ============= Error Data Collection =============

  function collectAdditionalErrorData() {
    return {
      "Date Range": selectedDateRange(),
      "Start Date": currentDateRange().startDate,
      "End Date": currentDateRange().endDate,
      "User Search Query": searchQuery() || "N/A",
      "Selected Role": selectedRole(),
      "Selected Status": selectedStatus(),
      "Current Page": currentPage(),
      "Sort Column": sortColumn(),
      "Sort Order": sortOrder(),
      "Total Records": serverAnalyticsResource()?.meta?.total || 0,
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
        handleError(error, "Usage Dashboard Error");
        return null;
      }}
    >
      <div class="container py-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h1 class="font-title fs-1 fw-bold mt-4 table-header-color">AI Usage Dashboard</h1>
        </div>

        <!-- Error Alert -->
        <${Show} when=${() => serverAnalyticsResource.error || rolesResource.error}>
          <div class="alert alert-danger" role="alert">
            ${() =>
              serverAnalyticsResource.error ||
              rolesResource.error ||
              "An error occurred while fetching data"}
          </div>
        <//>

        <!-- Date Range Filter -->
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
            <div class="col-md-3">
              <div class="row align-items-center">
                <div class="col-auto">
                  <label for="date-range-filter" class="form-label mb-0 fw-semibold px-2"
                    >Date Range</label
                  >
                </div>
                <div class="col px-0">
                  <select
                    class="form-select"
                    id="date-range-filter"
                    value=${selectedDateRange}
                    onInput=${(e) => setSelectedDateRange(e.target.value)}
                  >
                    <option>This Week</option>
                    <option>Last 30 Days</option>
                    <option>Last 60 Days</option>
                    <option>Last 120 Days</option>
                    <option>Last 360 Days</option>
                    <option>Custom</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- Custom Date Range (shown when Custom is selected) -->
          <${Show} when=${() => selectedDateRange() === "Custom"}>
            <div class="row g-3 align-items-center mt-3">
              <div class="col-md-3">
                <div class="row align-items-center">
                  <div class="col-auto">
                    <label for="custom-startDate" class="form-label mb-0 fw-semibold px-2"
                      >Start Date</label
                    >
                  </div>
                  <div class="col px-0">
                    <input
                      type="date"
                      id="custom-startDate"
                      class="form-control"
                      value=${() => customDates().startDate}
                      max=${() => customDates().endDate}
                      onInput=${(e) =>
                        setCustomDates((prev) => ({ ...prev, startDate: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div class="col-md-3">
                <div class="row align-items-center">
                  <div class="col-auto">
                    <label for="custom-endDate" class="form-label mb-0 fw-semibold px-2"
                      >End Date</label
                    >
                  </div>
                  <div class="col px-0">
                    <input
                      type="date"
                      id="custom-endDate"
                      class="form-control"
                      value=${() => customDates().endDate}
                      min=${() => customDates().startDate}
                      max=${formatDate(new Date())}
                      onInput=${(e) =>
                        setCustomDates((prev) => ({ ...prev, endDate: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          <//>
        </div>

        <!-- Users Table -->
        <${DataTable}
          remote=${true}
          data=${formattedUsers}
          loading=${() => isLoading()}
          loadingText="Loading users..."
          totalItems=${() => serverAnalyticsResource()?.meta?.total || 0}
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
              title: "User",
              className: "ps-4",
              cellClassName: "ps-4 small",
            },
            {
              key: "email",
              title: "Email",
              cellClassName: "small",
              render: (user) => user.email || "-",
            },
            {
              key: "role",
              title: "User Role",
              cellClassName: "text-capitalize small",
              render: (user) => user.role || "No Role",
            },
            {
              key: "inputTokens",
              title: "Input Tokens",
              cellClassName: "small",
            },
            {
              key: "outputTokens",
              title: "Output Tokens",
              cellClassName: "small",
            },
            {
              key: "weeklyCostLimit",
              title: "Weekly Cost Limit ($)",
              cellClassName: "small",
            },
            {
              key: "estimatedCost",
              title: "Estimated Cost ($)",
              cellClassName: "small",
            },
            {
              key: "action",
              title: "Action",
              cellClassName: "text-center",
              render: (user) => html`
                <a
                  href=${() => {
                    const range = currentDateRange();
                    const params = new URLSearchParams({
                      dateRange: selectedDateRange(),
                      startDate: range.startDate,
                      endDate: range.endDate,
                    });
                    return `/_/users/${user.id}/usage?${params.toString()}`;
                  }}
                  class="btn btn-outline-primary btn-sm text-decoration-none w-100 p-1"
                >
                  View Details
                </a>
              `,
            },
          ]}
        />

        <!-- Date Info -->
        <${Show} when=${() => !serverAnalyticsResource.loading && formattedUsers()?.length > 0}>
          <div class="mt-3 text-muted small">
            <p>
              Showing data from ${() => new Date(currentDateRange().startDate).toLocaleDateString()}
              to ${() => new Date(currentDateRange().endDate).toLocaleDateString()}
            </p>
            <p>Total results: ${() => serverAnalyticsResource()?.meta?.total || 0}</p>
          </div>
        <//>
      </div>
    <//>
  `;
}

export default UsersList;
