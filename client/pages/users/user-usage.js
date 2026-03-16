import { useParams, useSearchParams } from "@solidjs/router";
import { createMemo, createResource, createSignal, ErrorBoundary, Show } from "solid-js";
import html from "solid-js/html";

import { AlertContainer } from "../../components/alert.js";
import { alerts, clearAlert, handleError, handleHttpError } from "../../utils/alerts.js";

import { formatDateInputForDisplay, formatUtcTimestampToLocal } from "./date-utils.js";
import { calculateDateRange, formatDate, getDefaultStartDate, validateDateRange } from "./usage.js";

function UserUsage() {
  const params = useParams();
  const userId = params.id;
  const [searchParams] = useSearchParams();

  // Initialize from URL params or default
  const initialDateRange = searchParams.dateRange || "Last 30 Days";
  const initialStartDate = searchParams.startDate || getDefaultStartDate();
  const initialEndDate = searchParams.endDate || formatDate(new Date());

  // Validate the initial date range exists in options
  const validDateRange = validateDateRange(initialDateRange, "Last 30 Days");

  const [selectedDateRange, setSelectedDateRange] = createSignal(validDateRange);
  const [customDates, setCustomDates] = createSignal({
    startDate: initialStartDate,
    endDate: initialEndDate,
  });

  // Get current date range (either from preset or custom)
  const currentDateRange = createMemo(() => {
    if (selectedDateRange() === "Custom") {
      return customDates();
    }
    return calculateDateRange(selectedDateRange());
  });

  // Create resources for fetching data
  const [userResource] = createResource(async () => {
    try {
      const response = await fetch(`/api/v1/admin/users/${userId}`);
      if (!response.ok) {
        await handleHttpError(response, "fetching user details");
        return null;
      }
      return response.json();
    } catch (err) {
      const error = new Error("Something went wrong while retrieving user details.");
      error.cause = err;
      handleError(error, "User Data API Error");
      return null;
    }
  });

  const [analyticsData] = createResource(
    () => currentDateRange(),
    async ({ startDate, endDate }) => {
      try {
        const response = await fetch(
          `/api/v1/admin/analytics?groupBy=user&startDate=${startDate}&endDate=${endDate}&userId=${userId}`
        );
        if (!response.ok) {
          await handleHttpError(response, "fetching usage analytics");
          return { data: [] };
        }
        return response.json();
      } catch (err) {
        const error = new Error("Something went wrong while retrieving usage analytics.");
        error.cause = err;
        error.dateRange = `${startDate} to ${endDate}`;
        handleError(error, "Analytics API Error");
        return { data: [] };
      }
    }
  );

  const [dailyAnalytics] = createResource(
    () => currentDateRange(),
    async ({ startDate, endDate }) => {
      try {
        const response = await fetch(
          `/api/v1/admin/analytics?groupBy=day&startDate=${startDate}&endDate=${endDate}&userId=${userId}`
        );
        if (!response.ok) {
          await handleHttpError(response, "fetching daily analytics");
          return { data: [] };
        }
        return response.json();
      } catch (err) {
        const error = new Error("Something went wrong while retrieving daily analytics.");
        error.cause = err;
        error.dateRange = `${startDate} to ${endDate}`;
        handleError(error, "Daily Analytics API Error");
        return { data: [] };
      }
    }
  );

  const [modelAnalytics] = createResource(
    () => currentDateRange(),
    async ({ startDate, endDate }) => {
      try {
        const response = await fetch(
          `/api/v1/admin/analytics?groupBy=model&startDate=${startDate}&endDate=${endDate}&userId=${userId}`
        );
        if (!response.ok) {
          await handleHttpError(response, "fetching model analytics");
          return { data: [] };
        }
        return response.json();
      } catch (err) {
        const error = new Error("Something went wrong while retrieving model analytics.");
        error.cause = err;
        error.dateRange = `${startDate} to ${endDate}`;
        handleError(error, "Model Analytics API Error");
        return { data: [] };
      }
    }
  );

  const [typeAnalytics] = createResource(
    () => currentDateRange(),
    async ({ startDate, endDate }) => {
      try {
        const response = await fetch(
          `/api/v1/admin/analytics?groupBy=type&startDate=${startDate}&endDate=${endDate}&userId=${userId}`
        );
        if (!response.ok) {
          await handleHttpError(response, "fetching type analytics");
          return { data: [] };
        }
        return response.json();
      } catch (err) {
        const error = new Error("Something went wrong while retrieving type analytics.");
        error.cause = err;
        error.dateRange = `${startDate} to ${endDate}`;
        handleError(error, "Type Analytics API Error");
        return { data: [] };
      }
    }
  );

  const [rawUsageData] = createResource(
    () => currentDateRange(),
    async ({ startDate, endDate }) => {
      try {
        const response = await fetch(
          `/api/v1/admin/usage?startDate=${startDate}&endDate=${endDate}&userId=${userId}&limit=100`
        );
        if (!response.ok) {
          await handleHttpError(response, "fetching usage history");
          return { data: [] };
        }
        return response.json();
      } catch (err) {
        const error = new Error("Something went wrong while retrieving usage history.");
        error.cause = err;
        error.dateRange = `${startDate} to ${endDate}`;
        handleError(error, "Usage Data API Error");
        return { data: [] };
      }
    }
  );

  // Format currency
  function formatCurrency(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  }

  // Format numbers with commas
  function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value);
  }

  function formatTypeLabel(value) {
    return String(value || "unknown")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function formatUnitLabel(value) {
    return String(value || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function normalizeRequestId(value) {
    const requestId = String(value || "").trim();
    if (!requestId) return null;
    return ["unknown", "null", "undefined"].includes(requestId.toLowerCase()) ? null : requestId;
  }

  // Create computed values for display
  const userStats = createMemo(() => {
    const data = analyticsData()?.data?.[0];
    if (!data) return null;
    const typeMap = new Map(
      (typeAnalytics()?.data || []).map((entry) => [String(entry.type || "unknown"), entry])
    );
    const guardrail = typeMap.get("guardrail");
    return {
      totalRequests: data.totalRequests || 0,
      usageCost: Number(data.usageCost || 0),
      guardrailCost: Number(guardrail?.totalCost ?? data.guardrailCost ?? 0),
      totalCost: data.totalCost || 0,
    };
  });

  const groupedUsageData = createMemo(() => {
    const grouped = new Map();

    for (const entry of rawUsageData()?.data || []) {
      const requestId = normalizeRequestId(entry.requestId);
      const key = requestId ? `request:${requestId}` : `usage-${entry.id}`;
      const current = grouped.get(key) || {
        requestId,
        createdAt: entry.createdAt,
        modelName: null,
        fallbackModelName: entry.modelName || "Unknown",
        requestType: null,
        usageCost: 0,
        guardrailCost: 0,
        totalCost: 0,
        requestItems: new Map(),
      };

      if (new Date(entry.createdAt) > new Date(current.createdAt)) {
        current.createdAt = entry.createdAt;
      }

      if (!current.fallbackModelName) {
        current.fallbackModelName = entry.modelName || "Unknown";
      }

      const entryCost = Number(entry.cost || 0);
      current.totalCost += entryCost;

      const itemKey = `${entry.type || "usage"}:${entry.unit || ""}`;
      const existingItem = current.requestItems.get(itemKey) || {
        type: entry.type || "usage",
        unit: entry.unit,
        quantity: 0,
        cost: 0,
      };
      existingItem.quantity += Number(entry.quantity || 0);
      existingItem.cost += entryCost;
      current.requestItems.set(itemKey, existingItem);

      if (entry.type === "guardrail") {
        current.guardrailCost += entryCost;
        grouped.set(key, current);
        continue;
      }

      current.usageCost += entryCost;
      if (!current.requestType) {
        current.requestType = entry.type || "unknown";
      } else if (current.requestType !== (entry.type || "unknown")) {
        current.requestType = "multiple";
      }

      const entryModelName = entry.modelName || "Unknown";
      if (!current.modelName) {
        current.modelName = entryModelName;
      } else if (current.modelName !== entryModelName) {
        current.modelName = "Multiple";
      }

      grouped.set(key, current);
    }

    return Array.from(grouped.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((group) => ({
        ...group,
        typeLabel: formatTypeLabel(group.requestType || "unknown"),
        modelName: group.modelName || group.fallbackModelName || "Unknown",
        usageTitle: Array.from(group.requestItems.values())
          .sort((a, b) => Number(b.cost || 0) - Number(a.cost || 0))
          .map(
            (item) =>
              `${formatTypeLabel(item.type)}: ${formatUnitLabel(item.unit)} · ${formatNumber(item.quantity)} (${formatCurrency(item.cost || 0)})`
          )
          .join("\n"),
      }));
  });

  return html`
    <${AlertContainer} alerts=${alerts} onDismiss=${clearAlert} />
    <${ErrorBoundary}
      fallback=${(error) => {
        handleError(error, "User Usage Error");
        return null;
      }}
    >
      <div class="container py-4">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h1 class="font-title text-gradient fw-bold my-3">Usage Statistics</h1>
          <div class="d-flex gap-2">
            <a href="/_/usage" class="btn btn-outline-primary btn-sm text-decoration-none">
              Back to Usage Dashboard
            </a>
          </div>
        </div>

        <!-- User Info Card -->
        <div class="card shadow-sm mb-4">
          <div class="card-body">
            <div class="row">
              <div class="col-md-6">
                <h5>
                  ${() =>
                    userResource()
                      ? `${userResource().firstName || ""} ${userResource().lastName || ""}`
                      : ""}
                </h5>
                <p class="text-muted mb-0">${() => userResource()?.email || "No email"}</p>
              </div>
              <div class="col-md-6 text-md-end">
                <div class="mb-1">
                  <span class="fw-bold">Limit: </span>
                  <span
                    >${() =>
                      userResource()?.budget === null
                        ? "Unlimited"
                        : formatCurrency(userResource()?.budget || 0)}</span
                  >
                </div>
                <div>
                  <span class="fw-bold">Remaining: </span>
                  <span
                    >${() =>
                      userResource()?.remaining === null
                        ? "Unlimited"
                        : formatCurrency(userResource()?.remaining || 0)}</span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Date Range Filter -->
        <div class="card shadow-sm mb-4">
          <div class="card-body">
            <h5 class="card-title">Filter</h5>
            <div class="row g-3 align-items-end">
              <div class="col-md-6">
                <label for="date-range-filter" class="form-label">Date Range</label>
                <select
                  class="form-select"
                  id="date-range-filter"
                  value=${() => selectedDateRange()}
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

              <!-- Custom Date Range (shown when Custom is selected) -->
              <${Show} when=${() => selectedDateRange() === "Custom"}>
                <div class="col-md-3">
                  <label for="custom-startDate" class="form-label">Start Date</label>
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
                <div class="col-md-3">
                  <label for="custom-endDate" class="form-label">End Date</label>
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
              <//>
            </div>
          </div>
        </div>

        <!-- Error Alert -->
        <${Show}
          when=${() =>
            analyticsData.error ||
            userResource.error ||
            typeAnalytics.error ||
            rawUsageData.error ||
            modelAnalytics.error ||
            dailyAnalytics.error}
        >
          <div class="alert alert-danger" role="alert">
            ${() =>
              analyticsData.error ||
              userResource.error ||
              typeAnalytics.error ||
              rawUsageData.error ||
              modelAnalytics.error ||
              dailyAnalytics.error ||
              "An error occurred while fetching data"}
          </div>
        <//>

        <!-- Loading State -->
        <${Show}
          when=${() =>
            analyticsData.loading ||
            userResource.loading ||
            typeAnalytics.loading ||
            rawUsageData.loading}
        >
          <div class="d-flex justify-content-center my-5">
            <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
          </div>
        <//>

        <!-- Usage Summary -->
        <${Show} when=${() => !analyticsData.loading && userStats()}>
          <div class="row mb-4">
            <!-- Summary Card -->
            <div class="col-md-12">
              <div class="card shadow-sm h-100">
                <div class="card-header bg-light">
                  <h5 class="card-title mb-0">Usage Summary</h5>
                </div>
                <div class="card-body">
                  <div class="row">
                    <div class="col-md-3 mb-3">
                      <div class="card h-100">
                        <div class="card-body text-center">
                          <h6 class="text-muted">Total Requests</h6>
                          <h3>${() => formatNumber(userStats().totalRequests)}</h3>
                        </div>
                      </div>
                    </div>
                    <div class="col-md-3 mb-3">
                      <div class="card h-100">
                        <div class="card-body text-center">
                          <h6 class="text-muted">Usage Cost</h6>
                          <h3>${() => formatCurrency(userStats().usageCost)}</h3>
                        </div>
                      </div>
                    </div>
                    <div class="col-md-3 mb-3">
                      <div class="card h-100">
                        <div class="card-body text-center">
                          <h6 class="text-muted">Guardrail Cost</h6>
                          <h3>${() => formatCurrency(userStats().guardrailCost)}</h3>
                        </div>
                      </div>
                    </div>
                    <div class="col-md-3 mb-3">
                      <div class="card h-100">
                        <div class="card-body text-center">
                          <h6 class="text-muted">Total Cost</h6>
                          <h3>${() => formatCurrency(userStats().totalCost)}</h3>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="row mb-4">
            <!-- Model Breakdown -->
            <div class="col-md-6 mb-3">
              <div class="card shadow-sm h-100">
                <div class="card-header bg-light">
                  <h5 class="card-title mb-0">Usage by Model</h5>
                </div>
                <div class="card-body">
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th class="text-end">Requests</th>
                        <th class="text-end">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${() =>
                        (modelAnalytics()?.data || []).map(
                          (model) => html`
                            <tr>
                              <td>${model.Model?.name || "Unknown"}</td>
                              <td class="text-end">${formatNumber(model.totalRequests)}</td>
                              <td class="text-end">${formatCurrency(model.totalCost)}</td>
                            </tr>
                          `
                        )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Usage by Type -->
            <div class="col-md-6 mb-3">
              <div class="card shadow-sm h-100">
                <div class="card-header bg-light">
                  <h5 class="card-title mb-0">Usage by Type</h5>
                </div>
                <div class="card-body">
                  ${() =>
                    typeAnalytics()?.data && typeAnalytics().data.length > 0
                      ? html`
                          <table class="table table-sm">
                            <thead>
                              <tr>
                                <th>Type</th>
                                <th class="text-end">Requests</th>
                                <th class="text-end">Cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${() =>
                                typeAnalytics().data.map(
                                  (entry) => html`
                                    <tr>
                                      <td>${formatTypeLabel(entry.type)}</td>
                                      <td class="text-end">
                                        ${formatNumber(entry.totalRequests || 0)}
                                      </td>
                                      <td class="text-end">
                                        ${formatCurrency(entry.totalCost || 0)}
                                      </td>
                                    </tr>
                                  `
                                )}
                            </tbody>
                          </table>
                        `
                      : html`
                          <p class="text-muted text-center my-4">No usage type data available</p>
                        `}
                </div>
              </div>
            </div>
          </div>

          <div class="row mb-4">
            <div class="col-12">
              <div class="card shadow-sm h-100">
                <div class="card-header bg-light">
                  <h5 class="card-title mb-0">Daily Usage</h5>
                </div>
                <div class="card-body">
                  ${() =>
                    dailyAnalytics()?.data && dailyAnalytics().data.length > 0
                      ? html`
                          <table class="table table-sm">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th class="text-end">Usage Cost</th>
                                <th class="text-end">Guardrail Cost</th>
                                <th class="text-end">Total Cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${() =>
                                dailyAnalytics().data.map(
                                  (day) => html`
                                    <tr>
                                      <td>${formatDateInputForDisplay(String(day.period || "").slice(0, 10))}</td>
                                      <td class="text-end">
                                        ${formatCurrency(day.usageCost || 0)}
                                      </td>
                                      <td class="text-end">
                                        ${formatCurrency(day.guardrailCost || 0)}
                                      </td>
                                      <td class="text-end">${formatCurrency(day.totalCost)}</td>
                                    </tr>
                                  `
                                )}
                            </tbody>
                          </table>
                        `
                      : html`
                          <p class="text-muted text-center my-4">No daily usage data available</p>
                        `}
                </div>
              </div>
            </div>
          </div>

          <!-- Recent Requests -->
          <div class="card shadow-sm mb-4">
            <div class="card-header bg-light">
              <h5 class="card-title mb-0">Recent Requests</h5>
            </div>
            <div class="card-body">
              ${() =>
                groupedUsageData().length > 0
                  ? html`
                      <div class="table-responsive">
                        <table class="table table-sm table-hover">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Type</th>
                              <th>Model</th>
                              <th class="text-end">Usage Cost</th>
                              <th class="text-end">Guardrail Cost</th>
                              <th class="text-end">Total Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${() =>
                              groupedUsageData().map(
                                (entry) => html`
                                  <tr>
                                    <td>${formatUtcTimestampToLocal(entry.createdAt)}</td>
                                    <td>${entry.typeLabel}</td>
                                    <td>${entry.modelName || "Unknown"}</td>
                                    <td class="text-end">
                                      <span title=${entry.usageTitle || "No usage items"}>
                                        ${formatCurrency(entry.usageCost || 0)}
                                      </span>
                                    </td>
                                    <td class="text-end">
                                      ${formatCurrency(entry.guardrailCost || 0)}
                                    </td>
                                    <td class="text-end">${formatCurrency(entry.totalCost || 0)}</td>
                                  </tr>
                                `
                              )}
                          </tbody>
                        </table>
                      </div>
                    `
                  : html` <p class="text-muted text-center my-4">No recent requests found</p> `}
            </div>
          </div>
        <//>

        <!-- No Data Message -->
        <${Show} when=${() => !analyticsData.loading && !userStats()}>
          <div class="alert alert-info">
            No usage data found for this user in the selected date range.
          </div>
        <//>
      </div>
    <//>
  `;
}

export default UserUsage;
