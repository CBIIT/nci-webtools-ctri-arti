import {
  createMemo,
  createResource,
  createSignal,
  ErrorBoundary,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import html from "solid-js/html";

import { formatDate } from "../date-utils.js";

import { AlertContainer } from "../../../components/alert.js";
import { alerts, clearAlert, handleError, handleHttpError } from "../../../utils/alerts.js";
import {
  registerErrorDataCollector,
  unregisterErrorDataCollector,
} from "../../../utils/global-error-handler.js";
import { USAGE_TOOL_NAMES, USAGE_TYPE_NAMES, VALID_DATE_RANGES } from "../../constants.js";
import { usageTable } from "./usage-table.js";
import { usageTableHeader } from "./usage-table-header.js";

const fetchConfig = () => fetch("/api/config").then((r) => r.json());

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
  const [config] = createResource(fetchConfig);
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
  const [selectedTool, setSelectedTool] = createSignal("All");
  const [selectedType, setSelectedType] = createSignal("All");
  const [selectedStatus, setSelectedStatus] = createSignal("active");
  const [sortColumn, setSortColumn] = createSignal("estimatedCost");
  const [sortOrder, setSortOrder] = createSignal("desc");
  const [currentPage, setCurrentPage] = createSignal(1);
  const [rowsPerPage, setRowsPerPage] = createSignal(20);

  const statuses = ["All", "active", "inactive"];

  const roleNames = createMemo(() => {
    const allRoles =
      rolesResource()
        ?.map((role) => role.name)
        .filter(Boolean) || [];
    return ["All", ...new Set(allRoles)];
  });

  // Server-side analytics resource with all parameters
  const analyticsParams = createMemo(() => {
    const range = currentDateRange();
    if (!range.startDate || !range.endDate) return null;

    return {
      startDate: range.startDate,
      endDate: range.endDate,
      search: searchQuery().length >= 3 ? searchQuery() : undefined,
      role: selectedRole(),
      tool: selectedTool(),
      type: selectedType(),
      status: selectedStatus(),
      sortBy: sortColumn(),
      sortOrder: sortOrder(),
      limit: rowsPerPage(),
      offset: (currentPage() - 1) * rowsPerPage(),
    };
  });

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
      if (params.tool && params.tool !== "All") queryParams.set("tool", params.tool);
      if (params.type && params.type !== "All") queryParams.set("type", params.type);
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
        role: userStats.Role?.name || "No Role",
        roleID: user.roleID,
        tool: userStats.tool ?? user.tool ?? null,
        type: userStats.type ?? user.type ?? null,
        totalTokens: Math.round(
          (userStats.totalInputTokens || 0) + (userStats.totalOutputTokens || 0)
        ),
        costLimit: limitDisplay,
        estimatedCost: parseFloat(Number(userStats.totalCost || 0).toFixed(2)),
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

  const handleToolChange = (newTool) => {
    setSelectedTool(newTool);
    setCurrentPage(1); // Reset to first page
  };

  const handleTypeChange = (newType) => {
    setSelectedType(newType);
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

  const handleRowsPerPageChange = ({ rowsPerPage }) => {
    setRowsPerPage(rowsPerPage);
    setCurrentPage(1);
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
      "Selected Tool": selectedTool(),
      "Selected Type": selectedType(),
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
      <div
        class="w-100 overflow-hidden"
        style="font-family: system-ui; background: linear-gradient(180deg, #000E26 0%, #7EA4EE 55%, #FFFFFF 100%);"
      >
        <div
          class="w-100 d-flex align-items-center"
          style="background: url('/assets/images/users/user_banner.png') center top / cover no-repeat; min-height: 200px;"
          role="img"
          aria-label="Page header"
        >
          <div class="container">
            <h1 class="fs-1 mb-0 text-white">AI Usage Dashboard</h1>
          </div>
        </div>
        <div class="container pb-4" style="margin-top: -36px; position: relative; z-index: 1;">
          <div
            class="card shadow rounded-4 overflow-hidden"
            style="border: 3px solid #2b8ec9; background-color: #f8f9fa;"
          >
            <div class="card-body p-4">
              <!-- Error Alert -->
              <${Show} when=${() => serverAnalyticsResource.error || rolesResource.error}>
                <div class="alert alert-danger mb-4" role="alert">
                  ${() =>
                    serverAnalyticsResource.error ||
                    rolesResource.error ||
                    "An error occurred while fetching data"}
                </div>
              <//>

              <!-- Usage Table Header -->
              <${usageTableHeader}
                searchQuery=${searchQuery}
                handleSearch=${handleSearch}
                roleNames=${roleNames}
                selectedRole=${selectedRole}
                handleRoleChange=${handleRoleChange}
                statuses=${statuses}
                selectedStatus=${selectedStatus}
                handleStatusChange=${handleStatusChange}
                selectedTool=${selectedTool}
                handleToolChange=${handleToolChange}
                toolNames=${USAGE_TOOL_NAMES}
                selectedType=${selectedType}
                handleTypeChange=${handleTypeChange}
                typeNames=${USAGE_TYPE_NAMES}
                selectedDateRange=${selectedDateRange}
                setSelectedDateRange=${setSelectedDateRange}
                customDates=${customDates}
                setCustomDates=${setCustomDates}
                maxDate=${formatDate(new Date())}
              />

              <!-- Users Table -->
              <${usageTable}
                formattedUsers=${formattedUsers}
                isLoading=${isLoading}
                totalItems=${() => serverAnalyticsResource()?.meta?.total || 0}
                currentPage=${currentPage}
                searchQuery=${searchQuery}
                sortColumn=${sortColumn}
                sortOrder=${sortOrder}
                onSort=${handleSort}
                onPageChange=${handlePageChange}
                rowsPerPage=${rowsPerPage}
                onRowsPerPageChange=${handleRowsPerPageChange}
                currentDateRange=${currentDateRange}
                selectedDateRange=${selectedDateRange}
              />
            </div>
          </div>
        </div>
      </div>
    <//>
  `;
}

export default UsersList;
