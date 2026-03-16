import { For, Show } from "solid-js";
import html from "solid-js/html";

import { capitalize } from "../../../utils/utils.js";
import { VALID_DATE_RANGES } from "../../constants.js";

export function usageTableHeader(props) {
  return html`
    <div class="mb-4">
      <div
        class="mb-3"
        style="display: grid; gap: 1rem; grid-template-columns: repeat(5, minmax(0, 1fr));"
      >
        <!-- User Filter -->
        <div style="grid-column: span 2;">
          <label for="search-filter" class="form-label fw-semibold">User</label>
          <input
            type="text"
            class="form-control"
            id="search-filter"
            placeholder="Search by name or email (min 3 characters)"
            value=${props.searchQuery}
            onInput=${(e) => props.handleSearch(e.target.value)}
          />
        </div>

        <!-- Role Filter -->
        <div>
          <label for="role-filter" class="form-label fw-semibold">Role</label>
          <select
            class="form-select"
            id="role-filter"
            aria-label="Select Role Filter"
            value=${props.selectedRole}
            onInput=${(e) => props.handleRoleChange(e.target.value)}
          >
            <${For} each=${() => props.roleNames}>
              ${(role) => html`<option value=${role}>${capitalize(role)}</option>`}
            <//>
          </select>
        </div>

        <!-- Status Filter -->
        <div>
          <label for="status-filter" class="form-label fw-semibold">Status</label>
          <select
            class="form-select"
            id="status-filter"
            value=${props.selectedStatus}
            aria-label="Select Status Filter"
            onInput=${(e) => props.handleStatusChange(e.target.value)}
          >
            <${For} each=${() => props.statuses}>
              ${(status) =>
                html`<option value=${status} selected=${props.selectedStatus === status}>
                  ${capitalize(status)}
                </option>`}
            <//>
          </select>
        </div>

        <!-- Tool Filter -->
        <div>
          <label for="tool-filter" class="form-label fw-semibold">Tool</label>
          <select
            class="form-select"
            id="tool-filter"
            value=${props.selectedTool}
            aria-label="Select Tool Filter"
            onInput=${(e) => props.handleToolChange(e.target.value)}
          >
            <${For} each=${() => props.toolNames}>
              ${(tool) => html`<option value=${tool}>${tool}</option>`}
            <//>
          </select>
        </div>
      </div>

      <!-- Type Filter -->
      <div style="display: grid; gap: 1rem; grid-template-columns: repeat(4, minmax(0, 1fr));">
        <div>
          <label for="type-filter" class="form-label fw-semibold">Type</label>
          <select
            class="form-select"
            id="type-filter"
            value=${props.selectedType}
            aria-label="Select Type Filter"
            onInput=${(e) => props.handleTypeChange(e.target.value)}
          >
            <${For} each=${() => props.typeNames}>
              ${(type) => html`<option value=${type}>${capitalize(type)}</option>`}
            <//>
          </select>
        </div>

        <!-- Date Range Filter -->
        <div>
          <label for="date-range-filter" class="form-label fw-semibold">Date Range</label>
          <select
            class="form-select"
            id="date-range-filter"
            value=${props.selectedDateRange}
            onInput=${(e) => props.setSelectedDateRange(e.target.value)}
          >
            <${For} each=${VALID_DATE_RANGES}>
              ${(dateRange) => html`<option value=${dateRange}>${dateRange}</option>`}
            <//>
          </select>
        </div>

        <!-- Custom Date Range Filter -->
        <${Show} when=${() => props.selectedDateRange === "Custom"}>
          <div>
            <label for="custom-startDate" class="form-label fw-semibold">Start Date</label>
            <input
              type="date"
              id="custom-startDate"
              class="form-control"
              value=${() => props.customDates.startDate}
              max=${() => props.customDates.endDate}
              onChange=${(e) =>
                props.setCustomDates((prev) => ({ ...prev, startDate: e.target.value }))}
            />
          </div>
          <div>
            <label for="custom-endDate" class="form-label fw-semibold">End Date</label>
            <input
              type="date"
              id="custom-endDate"
              class="form-control"
              value=${() => props.customDates.endDate}
              min=${() => props.customDates.startDate}
              max=${props.maxDate}
              onChange=${(e) =>
                props.setCustomDates((prev) => ({ ...prev, endDate: e.target.value }))}
            />
          </div>
        <//>
      </div>
    </div>
  `;
}
