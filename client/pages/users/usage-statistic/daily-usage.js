import html from "solid-js/html";

import { formatCurrency, formatNumber } from "../../../utils/utils.js";
import { normalizeLocalTimestamp } from "../date-utils.js";

export function DailyUsage(props) {
  return html`
    <div class="card usage-section-card h-100">
      <div class="card-header">
        <h5 class="card-title">Daily Usage</h5>
      </div>
      <div class="card-body">
        ${() =>
          props.dailyAnalytics?.data && props.dailyAnalytics.data.length > 0
            ? html`
                <table class="table table-hover usage-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th class="text-start">Total Requests</th>
                      <th class="text-start">Usage Cost</th>
                      <th class="text-start">Guardrail Cost</th>
                      <th class="text-start">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${() =>
                      props.dailyAnalytics.data.map(
                        (day) => html`
                          <tr>
                            <td class="text-start">
                              <a
                                href="#"
                                class="text-decoration-none"
                                style="color: #1075FD;"
                                onClick=${(e) => {
                                  e.preventDefault();
                                  props.onSelectDailyUsageDay?.(day.period);
                                }}
                              >
                                ${normalizeLocalTimestamp(day.period)}
                              </a>
                            </td>
                            <td class="text-start">${formatNumber(day.totalRequests)}</td>
                            <td class="text-start">
                              ${day.usageCost != null
                                ? formatCurrency(day.usageCost)
                                : "Unavailable"}
                            </td>
                            <td class="text-start">
                              ${day.guardrailCost != null
                                ? formatCurrency(day.guardrailCost)
                                : "Unavailable"}
                            </td>
                            <td class="text-start">
                              ${day.totalCost != null
                                ? formatCurrency(day.totalCost)
                                : "Unavailable"}
                            </td>
                          </tr>
                        `
                      )}
                  </tbody>
                </table>
              `
            : html` <p class="text-muted text-center my-4">No daily usage data available</p> `}
      </div>
    </div>
  `;
}
