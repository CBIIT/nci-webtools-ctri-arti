import html from "solid-js/html";

import { formatNumber, formatCurrency } from "../../../utils/utils.js";

export function UsageSummary(props) {
  return html`
    <div class="card usage-section-card usage-summary">
      <div class="card-header">
        <h5 class="card-title">Usage Summary</h5>
      </div>
      <div class="card-body">
        <div class="row g-2">
          <div class="col-md-3">
            <div class="card usage-metric-card h-100">
              <div class="card-body usage-summary-details">
                <h6 class="usage-metric-label">Total Requests</h6>
                <h3 class="mb-0 mt-0 fw-semibold usage-metric-value usage-metric-value--requests">
                  ${() => formatNumber(props.userStats ? props.userStats.totalRequests : 0)}
                </h3>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card usage-metric-card h-100">
              <div class="card-body usage-summary-details">
                <h6 class="usage-metric-label">User Cost ($)</h6>
                <h3 class="mb-0 mt-0 fw-semibold usage-metric-value usage-metric-value--usage">
                  ${() => formatCurrency(props.userStats ? props.userStats.usageCost : 0)}
                </h3>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card usage-metric-card h-100">
              <div class="card-body usage-summary-details">
                <h6 class="usage-metric-label">Guardrail Cost ($)</h6>
                <h3 class="mb-0 mt-0 fw-semibold usage-metric-value usage-metric-value--guardrail">
                  ${() => formatCurrency(props.userStats ? props.userStats.guardrailCost : 0)}
                </h3>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card usage-metric-card h-100">
              <div class="card-body usage-summary-details">
                <h6 class="usage-metric-label">Total Cost</h6>
                <h3 class="mb-0 mt-0 fw-semibold usage-metric-value usage-metric-value--total">
                  ${() => formatCurrency(props.userStats ? props.userStats.totalCost : 0)}
                </h3>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
