import { For, Show } from "solid-js";
import html from "solid-js/html";

import { capitalize } from "../../../utils/utils.js";
import { VALID_DATE_RANGES, USER_SEARCH_PLACEHOLDER } from "../../constants.js";

export function usageTableHeader(props) {
  return html`
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <div
        style="display: grid; gap: 1rem; grid-template-columns: repeat(5, minmax(0, 1fr));"
      >
        <!-- User Filter -->
        <div class="form-header-input-group" style="grid-column: span 2;">          
        <label for="search-filter" class="form-header-label">User</label>
          <input
            type="text"
            class="form-control data-form-field usage-search-input-icon search-placeholder"
            id="search-filter"
            placeholder="${USER_SEARCH_PLACEHOLDER}"
            value=${props.searchQuery}
            onInput=${(e) => props.handleSearch(e.target.value)}
          />
        </div>

        <!-- Role Filter -->
        <div class="form-header-input-group"> 
          <label for="role-filter" class="form-header-label">Role</label>
          <select
            class="form-select data-form-field form-header-input-label"
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
        <div class="form-header-input-group"> 
          <label for="status-filter" class="form-header-label">Status</label>
          <select
            class="form-select data-form-field form-header-input-label"
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
        <div class="form-header-input-group"> 
          <label for="tool-filter" class="form-header-label">Tool</label>
          <select
            class="form-select data-form-field form-header-input-label"
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
        <div class="form-header-input-group"> 
          <label for="type-filter" class="form-header-label">Type</label>
          <select
            class="form-select data-form-field form-header-input-label"
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
        <div class="form-header-input-group"> 
          <label for="date-range-filter" class="form-header-label">Date Range</label>
          <select
            class="form-select data-form-field form-header-input-label"
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
          <div class="form-header-input-group">
            <label for="custom-startDate" class="form-header-label">Start Date</label>
            <input
              type="date"
              id="custom-startDate"
              class="form-control data-form-field form-header-input-label"
              value=${() => props.customDates.startDate}
              max=${() => props.customDates.endDate}
              onChange=${(e) =>
                props.setCustomDates((prev) => ({ ...prev, startDate: e.target.value }))}
            />
          </div>
        <div class="form-header-input-group">
            <label for="custom-endDate" class="form-header-label">End Date</label>
            <input
              type="date"
              id="custom-endDate"
              class="form-control data-form-field form-header-input-label"
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
