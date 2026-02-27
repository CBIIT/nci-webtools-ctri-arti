import { createMemo, createResource, createSignal, ErrorBoundary, Show } from "solid-js";
import html from "solid-js/html";

import { useParams, useSearchParams } from "@solidjs/router";

import { AlertContainer } from "../../components/alert.js";
import { alerts, clearAlert, handleError, handleHttpError } from "../../utils/alerts.js";

import { calculateDateRange, formatDate, getDefaultStartDate, validateDateRange } from "./usage.js";

function UserUsage() {
  const params = useParams();
  const userId = params.id;
  const [searchParams] = useSearchParams();

  console.log(JSON.stringify(searchParams));

  // Initialize from URL params or default
  const initialDateRange = searchParams.dateRange || "Last 30 Days";
  const initialStartDate = searchParams.startDate || getDefaultStartDate();
  const initialEndDate = searchParams.endDate || formatDate(new Date());
  console.log("Initial Date Range:", initialDateRange);

  // Validate the initial date range exists in options
  const validDateRange = validateDateRange(initialDateRange, "Last 30 Days");
  console.log("Valid Date Range:", validDateRange);

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

  const [rawUsageData] = createResource(
    () => currentDateRange(),
    async ({ startDate, endDate }) => {
      try {
        const response = await fetch(
          `/api/v1/admin/usage?startDate=${startDate}&endDate=${endDate}&userId=${userId}&limit=20`
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
    }).format(value);
  }

  // Format numbers with commas
  function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value);
  }

  // Create computed values for display
  const userStats = createMemo(() => {
    const data = analyticsData()?.data?.[0];
    if (!data) return null;
    return {
      totalRequests: data.totalRequests || 0,
      totalInputTokens: data.totalInputTokens || 0,
      totalOutputTokens: data.totalOutputTokens || 0,
      totalCost: data.totalCost || 0,
    };
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
        <${Show} when=${() => analyticsData.error || userResource.error}>
          <div class="alert alert-danger" role="alert">
            ${() =>
              analyticsData.error || userResource.error || "An error occurred while fetching data"}
          </div>
        <//>

        <!-- Loading State -->
        <${Show} when=${() => analyticsData.loading || userResource.loading}>
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
                          <h6 class="text-muted">Input Tokens</h6>
                          <h3>${() => formatNumber(userStats().totalInputTokens)}</h3>
                        </div>
                      </div>
                    </div>
                    <div class="col-md-3 mb-3">
                      <div class="card h-100">
                        <div class="card-body text-center">
                          <h6 class="text-muted">Output Tokens</h6>
                          <h3>${() => formatNumber(userStats().totalOutputTokens)}</h3>
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
                        <th class="text-end">Tokens</th>
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
                              <td class="text-end">
                                ${formatNumber(
                                  (model.totalInputTokens || 0) + (model.totalOutputTokens || 0)
                                )}
                              </td>
                              <td class="text-end">${formatCurrency(model.totalCost)}</td>
                            </tr>
                          `
                        )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Daily Usage -->
            <div class="col-md-6 mb-3">
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
                                <th class="text-end">Requests</th>
                                <th class="text-end">Cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${() =>
                                dailyAnalytics().data.map(
                                  (day) => html`
                                    <tr>
                                      <td>${day.period}</td>
                                      <td class="text-end">${formatNumber(day.totalRequests)}</td>
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
                rawUsageData()?.data && rawUsageData().data.length > 0
                  ? html`
                      <div class="table-responsive">
                        <table class="table table-sm table-hover">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Model</th>
                              <th class="text-end">Input Tokens</th>
                              <th class="text-end">Output Tokens</th>
                              <th class="text-end">Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${() =>
                              rawUsageData().data.map(
                                (entry) => html`
                                  <tr>
                                    <td>${new Date(entry.createdAt).toLocaleString()}</td>
                                    <td>${entry.modelName || "Unknown"}</td>
                                    <td class="text-end">
                                      ${formatNumber(entry.inputTokens || 0)}
                                    </td>
                                    <td class="text-end">
                                      ${formatNumber(entry.outputTokens || 0)}
                                    </td>
                                    <td class="text-end">${formatCurrency(entry.cost || 0)}</td>
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
