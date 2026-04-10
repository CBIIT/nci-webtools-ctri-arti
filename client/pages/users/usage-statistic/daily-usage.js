import { createEffect, createMemo, createSignal, For } from "solid-js";
import html from "solid-js/html";

import { formatCurrency, formatNumber } from "../../../utils/utils.js";
import { ROWS_PER_PAGE_OPTIONS } from "../../constants.js";
import { normalizeLocalTimestamp } from "../date-utils.js";

export function DailyUsage(props) {
  const [currentPage, setCurrentPage] = createSignal(1);
  const [rowsPerPage, setRowsPerPage] = createSignal(10);

  const allRows = () => props.dailyAnalytics?.data ?? [];

  const totalPages = createMemo(() => {
    const len = allRows().length;
    return Math.ceil(len / rowsPerPage()) || 0;
  });

  const pagedRows = createMemo(() => {
    const data = allRows();
    const start = (currentPage() - 1) * rowsPerPage();
    return data.slice(start, start + rowsPerPage());
  });

  createEffect(() => {
    allRows();
    rowsPerPage();
    return totalPages();
  });

  const handlePageChange = (page) => setCurrentPage(page);

  const handleRowsPerPageChange = (n) => {
    setRowsPerPage(n);
    setCurrentPage(1);
  };

  return html`
    <div class="d-flex flex-column">
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
                      <${For} each=${pagedRows}>
                        ${(day) => html`
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
                        `}
                      <//>
                    </tbody>
                  </table>
                `
              : html` <p class="text-muted text-center my-4">No daily usage data available</p> `}
        </div>
      </div>
      ${() =>
        props.dailyAnalytics?.data && props.dailyAnalytics.data.length > 0
          ? html`
              <div
                class="d-flex align-items-center justify-content-end mt-3"
                style="gap: 40px; padding: 0;"
              >
                <div class="page-count-label">
                  Page ${() => (totalPages() === 0 ? 0 : currentPage())} of ${() => totalPages()}
                </div>
                <div class="d-flex align-items-center gap-2">
                  <label for="daily-usage-rows-per-page" class="page-count-label"
                    >Rows per page:</label
                  >
                  <select
                    id="daily-usage-rows-per-page"
                    class="form-select form-select-sm"
                    style="width: auto;"
                    value=${() => rowsPerPage()}
                    onInput=${(e) => handleRowsPerPageChange(Number(e.target.value))}
                  >
                    <${For} each=${ROWS_PER_PAGE_OPTIONS}>
                      ${(option) => html`
                        <option value=${option} selected=${() => rowsPerPage() === option}>
                          ${option}
                        </option>
                      `}
                    <//>
                  </select>
                </div>
                <div>
                  <button
                    class="btn btn-sm btn-outline-primary me-2 table-pagination-btn"
                    onClick=${() => handlePageChange(Math.max(1, currentPage() - 1))}
                    disabled=${() => currentPage() === 1}
                  >
                    Previous
                  </button>
                  <button
                    class="btn btn-sm btn-outline-primary table-pagination-btn"
                    onClick=${() => handlePageChange(Math.min(totalPages(), currentPage() + 1))}
                    disabled=${() => totalPages() === 0 || currentPage() === totalPages()}
                  >
                    Next
                  </button>
                </div>
              </div>
            `
          : null}
    </div>
  `;
}
