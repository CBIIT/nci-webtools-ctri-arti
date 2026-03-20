import { useParams, useSearchParams } from "@solidjs/router";
import { createMemo, createResource, createSignal, ErrorBoundary, Show } from "solid-js";
import html from "solid-js/html";

import { AlertContainer } from "../../../components/alert.js";
import { alerts, clearAlert, handleError, handleHttpError } from "../../../utils/alerts.js";
import { formatCurrency, formatNumber, formatTypeLabel, formatUnitLabel, normalizeRequestId, normalizeModelGroupKey } from "../../../utils/utils.js";
import { formatUtcTimestampToLocal, formatUTCTimestampToLocalDate } from "../date-utils.js";
import { formatDate } from "../date-utils.js";
import { Overview } from "./overview.js";
import { UsageSummary } from "./usage-summary.js";
import { DailyUsage } from "./daily-usage.js";
import { RequestHistory } from "./request-history.js";
import {
  calculateDateRange,
  getDefaultStartDate,
  validateDateRange,
} from "../usage/usage.js";

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

  // Fetch user usage details
  const [userUsageDetails] = createResource(async () => {
      try {
        const response = await fetch(`/api/v1/admin/users/${userId}/usage`);
        if(!response.ok) {
          await handleHttpError(response, "fetching user usage details");
          return { data: [] };
        }
        console.log("daily analytics", response.json());

        return response.json(); 
      } catch (err) {
        const error = new Error("Something went wrong while retrieving user usage details.");
        error.cause = err;
        handleError(error, "User Usage Details API Error");
        return { data: [] };
      }
    }
  );

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
        const data = await response.json();
        return data;
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
      usageCost: data.usageCost || 0,
      guardrailCost: Number(guardrail?.totalCost ?? data.guardrailCost ?? 0),
      totalCost: data.totalCost || 0,
    };
  });

  const groupedUsageData = createMemo(() => {
    const grouped = new Map();

    for (const entry of rawUsageData()?.data || []) {
      const requestId = normalizeRequestId(entry.requestId);
      const modelGroupKey = normalizeModelGroupKey(entry);
      const key = requestId
        ? `request:${requestId}:${modelGroupKey || "unknown-model"}`
        : `usage-${entry.id}`;
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
      current.modelName = current.modelName || entryModelName;

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
      <div class="page-header-bg overflow-hidden" style="font-family: system-ui;">
        <div class="page-header-banner pt-3 pb-5">
          <div class="container">
            <a href="/_/usage" class="text-decoration-none d-inline-flex align-items-center mb-2 return-btn-color">
              <span class="me-1">&larr;</span> Back to AI Usage Dashboard
            </a>
            <h1 class="fs-1 mb-0 mt-3 text-white">Usage Statistics</h1>
          </div>
        </div>
        <div class="container pb-4">
          <div class="card shadow rounded-4 overflow-hidden page-content-card">
            <div class="card-body p-4">
              <!-- Error Alert -->
              <${Show} when=${() => analyticsData.error || userResource.error}>
                <div class="alert alert-danger" role="alert">
                  ${() =>
                    analyticsData.error ||
                    userResource.error ||
                    "An error occurred while fetching data"}
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

              <${Overview}
                userResource=${() => userResource()}
                formatCurrency=${formatCurrency}
                selectedDateRange=${selectedDateRange}
                setSelectedDateRange=${setSelectedDateRange}
                customDates=${customDates}
                setCustomDates=${setCustomDates}
                maxDate=${formatDate(new Date())}
              />

              <!-- Usage Summary -->
              <${Show} when=${() => !analyticsData.loading && userStats()}>
                <${UsageSummary}
                  userStats=${() => userStats()}
                  formatNumber=${formatNumber}
                  formatCurrency=${formatCurrency}
                />
                <${DailyUsage}
                  dailyAnalytics=${() => dailyAnalytics()}
                  userUsageDetails=${() => userUsageDetails()}
                  formatUTCTimestampToLocalDate=${formatUTCTimestampToLocalDate}
                  formatNumber=${formatNumber}
                  formatCurrency=${formatCurrency}
                />
                <${RequestHistory}
                  groupedUsageData=${() => groupedUsageData()}
                  formatUtcTimestampToLocal=${formatUtcTimestampToLocal}
                  formatNumber=${formatNumber}
                  formatCurrency=${formatCurrency}
                />
              <//>

              <!-- No Data Message -->
              <${Show} when=${() => !analyticsData.loading && !userStats()}>
                <div class="alert alert-info">
                  No usage data found for this user in the selected date range.
                </div>
              <//>
            </div>
          </div>
        </div>
      </div>
    <//>
  `;
}

export default UserUsage;
