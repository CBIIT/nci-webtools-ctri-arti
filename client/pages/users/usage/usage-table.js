import html from "solid-js/html";

import { DataTable } from "../../../components/table.js";
export function usageTable(props) {
  const columns = [
    {
      key: "name",
      title: "User",
      className: "ps-4",
      cellClassName: "ps-4 small",
    },
    {
      key: "email",
      title: "Email",
      cellClassName: "small",
      render: (user) => user.email || "-",
    },
    {
      key: "role",
      title: "User Role",
      cellClassName: "text-capitalize small",
      render: (user) => user.role || "No Role",
    },
    {
      key: "tool",
      title: "Tool",
      cellClassName: "text-capitalize small",
      render: (user) => user.tool || "Unavailable",
    },
    {
      key: "type",
      title: "Type",
      cellClassName: "text-capitalize small",
      render: (user) => user.type || "Unavailable",
    },
    {
      key: "estimatedCost",
      title: "Usage Cost ($)",
      cellClassName: "small",
      render: (user) => `$${Number(user.estimatedCost || 0).toFixed(2)}`,
    },
    {
      key: "action",
      title: "Action",
      className: "text-center",
      cellClassName: "text-center",
      render: (user) => html`
        <a
          href=${() => {
            const range = props.currentDateRange;
            const params = new URLSearchParams({
              dateRange: props.selectedDateRange,
              startDate: range.startDate,
              endDate: range.endDate,
            });
            return `/_/users/${user.id}/usage?${params.toString()}`;
          }}
          class="btn d-inline-flex align-items-center justify-content-center text-decoration-none rounded-pill px-3 py-2 fw-semibold"
          style="min-width: 150px; border: 2px solid #5d84e5; color: #3f3f3f; background-color: transparent;"
        >
          View Details
        </a>
      `,
    },
  ];

  return html`
    <${DataTable}
      remote=${true}
      data=${() => props.formattedUsers}
      loading=${() => props.isLoading}
      loadingText="Loading users..."
      totalItems=${() => (props.totalItems ?? 0)}
      page=${() => props.currentPage}
      search=${() => {
        const q = props.searchQuery;
        return typeof q === "string" && q.length >= 3 ? q : "";
      }}
      sortColumn=${() => props.sortColumn}
      sortOrder=${() => props.sortOrder}
      onSort=${props.onSort}
      onPageChange=${props.onPageChange}
      rowsPerPage=${() => props.rowsPerPage}
      onRowsPerPageChange=${props.onRowsPerPageChange}
      className="users-table usage-users-table"
      columns=${columns}
    />
  `;
}
