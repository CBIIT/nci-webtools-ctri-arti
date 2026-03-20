import { For, Show } from "solid-js";
import html from "solid-js/html";
import { VALID_DATE_RANGES } from "../../constants.js";

export function Overview(props) {
  return html`
    <div class="card mb-4">
      <div class="card-body">
        <h5 class="fw-bold mb-1">
          ${() =>
            props.userResource
              ? `${props.userResource.firstName || ""} ${props.userResource.lastName || ""}`
              : ""}
        </h5>
        <p class="text-muted mb-3">
          ${() => props.userResource?.email || "Email not found"}
          <span class="ms-3 fw-bold">Limit:</span>
          ${" "}
          ${() =>
            props.userResource?.budget === null
              ? "Unlimited"
              : props.formatCurrency(props.userResource?.budget || 0)}
        </p>
        <div class="row g-3">
          <div class="col-md-4">
            <label for="date-range-filter" class="form-label">Date Range</label>
            <select
              class="form-select"
              id="date-range-filter"
              value=${() => props.selectedDateRange}
              onInput=${(e) => props.setSelectedDateRange(e.target.value)}
            >
              <${For} each=${VALID_DATE_RANGES}>
                ${(dateRange) => html`<option value=${dateRange}>${dateRange}</option>`}
              <//>
            </select>
          </div>

          <${Show} when=${() => props.selectedDateRange === "Custom"}>
            <div class="col-md-4">
              <label for="custom-startDate" class="form-label">Start Date</label>
              <input
                type="date"
                id="custom-startDate"
                class="form-control"
                value=${() => props.customDates.startDate}
                max=${() => props.customDates.endDate}
                onInput=${(e) =>
                  props.setCustomDates((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div class="col-md-4">
              <label for="custom-endDate" class="form-label">End Date</label>
              <input
                type="date"
                id="custom-endDate"
                class="form-control"
                value=${() => props.customDates.endDate}
                min=${() => props.customDates.startDate}
                max=${props.maxDate}
                onInput=${(e) =>
                  props.setCustomDates((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          <//>
        </div>
      </div>
    </div>
  `;
}
