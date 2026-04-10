import { useParams, useSearchParams } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  ErrorBoundary,
  Show,
} from "solid-js";
import html from "solid-js/html";

import { AlertContainer } from "../../../components/alert.js";
import { alerts, clearAlert, handleError, handleHttpError } from "../../../utils/alerts.js";
import {
  formatCurrency,
  formatNumber,
  formatTypeLabel,
  formatUnitLabel,
  normalizeRequestId,
  normalizeModelGroupKey,
} from "../../../utils/utils.js";
import { DEFAULT_TIMEZONE, NO_DATA_MESSAGE, VALID_DATE_RANGES } from "../../constants.js";
import {
  calculateDateRange,
  getDefaultStartDate,
  normalizeLocalTimestamp,
  formatDate,
  validateDateRange,
} from "../date-utils.js";

import { DailyUsage } from "./daily-usage.js";
import { Overview } from "./overview.js";
import { RequestHistory } from "./request-history.js";
import { UsageSummary } from "./usage-summary.js";

function UserUsage() {
  const params = useParams();
  const userId = params.id;
  const [searchParams] = useSearchParams();

  // Default start date: Last 30 days
  const initialDateRange = searchParams.dateRange || VALID_DATE_RANGES[0];
  const initialStartDate = searchParams.startDate || getDefaultStartDate();
  const initialEndDate = searchParams.endDate || new Date().toISOString();

  // Validate the initial date range exists in options
  const validDateRange = validateDateRange(initialDateRange, VALID_DATE_RANGES[0]);

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

  const [requestHistoryDayOverride, setRequestHistoryDayOverride] = createSignal(null);

  createEffect(() => {
    selectedDateRange();
    customDates();
    setRequestHistoryDayOverride(null);
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
          `/api/v1/admin/analytics?groupBy=day&startDate=${startDate}&endDate=${endDate}&userId=${userId}&tz=${DEFAULT_TIMEZONE}`
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

  // `dailyAnalytics.data` is expected to be pre-sorted; first row drives the request-history window.
  const mostRecentDateInRange = createMemo(() => {
    const data = dailyAnalytics()?.data;
    if (!data || data.length === 0) return null;
    const first = data[0];
    const recentDate = normalizeLocalTimestamp(first.period);
    return { startDate: recentDate, endDate: recentDate };
  });

  /** Single-day window for `/admin/usage` (daily-table override or default first row). */
  const requestHistoryDateRange = createMemo(() => {
    const recentDate = mostRecentDateInRange();
    const override = requestHistoryDayOverride();
    if (override) return override;
    return recentDate;
  });

  const onSelectDailyUsageDay = (period) => {
    const ymd = normalizeLocalTimestamp(period); // the period is always at local timezone
    if (!ymd) return;
    setRequestHistoryDayOverride({ startDate: ymd, endDate: ymd });
  };

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
    () => requestHistoryDateRange(),
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
      <div class="font-inter font-smooth">
        <div class="page-header-banner">
          <div class="container d-flex flex-column" style="gap: 40px;">
            <a
              href="/_/usage"
              class="text-decoration-none d-inline-flex align-items-center return-btn-color"
              style="padding: 20px 0 0 44px;"
            >
              <div class="d-flex align-items-center" style="gap: 20px;">
                <img
                  src="/assets/images/icon-vector.svg"
                  alt=""
                  width="21"
                  height="18"
                  class="me-1"
                  aria-hidden="true"
                />
                Back to AI Usage Dashboard
              </div>
            </a>
            <h1 class="text-white font-poppins page-header-text">Usage Statistics</h1>
          </div>
        </div>
        <div class="container pb-4" style="position: relative">
          <div class="usage-card-body">
            <div class="usage-card-body-inner">
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

              <${Show} when=${() => !analyticsData.loading && !userResource.loading}>
                <${Overview}
                  userResource=${userResource}
                  selectedDateRange=${selectedDateRange}
                  setSelectedDateRange=${setSelectedDateRange}
                  customDates=${customDates}
                  setCustomDates=${setCustomDates}
                  maxDate=${formatDate(new Date())}
                />

                <${UsageSummary} userStats=${userStats} />
              <//>

              <${Show} when=${() => !dailyAnalytics.loading}>
                <${DailyUsage}
                  dailyAnalytics=${dailyAnalytics}
                  onSelectDailyUsageDay=${onSelectDailyUsageDay}
                />
              <//>
              <${Show} when=${() => !analyticsData.loading}>
                <${RequestHistory}
                  dateRange=${requestHistoryDateRange}
                  groupedUsageData=${groupedUsageData}
                />
              <//>
              <!-- No Data Message -->
              <${Show} when=${() => !analyticsData.loading && !userStats()}>
                <div class="alert alert-info">${NO_DATA_MESSAGE}</div>
              <//>
            </div>
          </div>
        </div>
      </div>
    <//>
  `;
}

export default UserUsage;
