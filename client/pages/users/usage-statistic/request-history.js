import html from "solid-js/html";

import { formatCurrency } from "../../../utils/utils.js";
import { formatUtcTimestampToDefaultTimezone } from "../date-utils.js";

export function RequestHistory(props) {
  return html`
    <div class="card usage-section-card">
      <div class="card-header">
        <h5 class="card-title">Requests History - ${() => props.dateRange?.startDate ?? "—"}</h5>
      </div>
      <div class="card-body">
        ${() =>
          props.groupedUsageData?.length > 0
            ? html`
                <div class="table-responsive">
                  <table class="table table-hover usage-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Tool</th>
                        <th>Model</th>
                        <th class="text-end">Total Tool Cost</th>
                        <th class="text-end">Total Guardrail Cost</th>
                        <th class="text-end">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${() =>
                        props.groupedUsageData.map(
                          (entry) => html`
                            <tr>
                              <td>${formatUtcTimestampToDefaultTimezone(entry.createdAt)}</td>
                              <td>${entry.typeLabel}</td>
                              <td>${entry.modelName || "Unknown"}</td>
                              <td class="text-end">
                                <span title=${entry.usageTitle || "No usage items"}>
                                  ${formatCurrency(entry.usageCost || 0)}
                                </span>
                              </td>
                              <td class="text-end">${formatCurrency(entry.guardrailCost || 0)}</td>
                              <td class="text-end">${formatCurrency(entry.totalCost || 0)}</td>
                            </tr>
                          `
                        )}
                    </tbody>
                  </table>
                </div>
              `
            : html`<p class="text-muted text-center my-4">No recent requests found</p>`}
      </div>
    </div>
  `;
}
