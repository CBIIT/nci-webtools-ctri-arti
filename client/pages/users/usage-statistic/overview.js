import { For, Show } from "solid-js";
import html from "solid-js/html";

import { formatCurrency } from "../../../utils/utils.js";
import { VALID_DATE_RANGES } from "../../constants.js";
import {
  localDateInputToUtcEndIso,
  localDateInputToUtcStartIso,
  toDateInputValue,
} from "../date-utils.js";

export function Overview(props) {
  const userResource = () => props.userResource;
  const startDate = () => props.customDates?.startDate;
  const endDate = () => props.customDates?.endDate;

  return html`
    <div class="card usage-overview-card" style="padding: 15px 17px 12px 17px; gap: 15px;">
      <div class="d-flex flex-column">
        <h5 class="usage-user-name mb-0">
          ${() =>
            userResource()
              ? `${userResource()?.firstName || ""} ${userResource()?.lastName || ""}`
              : ""}
        </h5>
        <div class="d-flex flex-row flex-wrap align-items-baseline" style="gap: 15px;">
          <p class="usage-user-email mb-0">${() => userResource()?.email || "Email not found"}</p>
          <div class="d-flex flex-row align-items-baseline" style="gap: 8px;">
            <span class="fw-bold">Limit:</span>
            ${() =>
              userResource()?.budget === null
                ? "Unlimited"
                : formatCurrency(userResource()?.budget || 0)}
          </div>
        </div>
      </div>
      <div class="row g-3 w-100">
        <div class="col-md-4">
          <label for="date-range-filter" class="form-header-label">Date Range</label>
          <select
            class="form-select form-header-input-label"
            id="date-range-filter"
            value=${props.selectedDateRange}
            onInput=${(e) => props.setSelectedDateRange(e.target.value)}
          >
            <${For} each=${VALID_DATE_RANGES}>
              ${(dateRange) => html`<option value=${dateRange}>${dateRange}</option>`}
            <//>
          </select>
        </div>

        <${Show} when=${() => props.selectedDateRange === "Custom"}>
          <div class="col-md-4">
            <label for="custom-startDate" class="form-header-label">Start Date</label>
            <input
              type="date"
              id="custom-startDate"
              class="form-control form-header-input-label"
              value=${() => toDateInputValue(startDate())}
              max=${() => toDateInputValue(endDate())}
              onInput=${(e) =>
                props.setCustomDates((prev) => ({
                  ...prev,
                  startDate: localDateInputToUtcStartIso(e.target.value),
                }))}
            />
          </div>
          <div class="col-md-4">
            <label for="custom-endDate" class="form-header-label">End Date</label>
            <input
              type="date"
              id="custom-endDate"
              class="form-control form-header-input-label"
              value=${() => toDateInputValue(endDate())}
              min=${() => toDateInputValue(startDate())}
              max=${props.maxDate}
              onInput=${(e) =>
                props.setCustomDates((prev) => ({
                  ...prev,
                  endDate: localDateInputToUtcEndIso(e.target.value),
                }))}
            />
          </div>
        <//>
      </div>
    </div>
  `;
}
