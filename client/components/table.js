import { createMemo, createSignal, For } from "solid-js";
import html from "solid-js/html";

import { ROWS_PER_PAGE_OPTIONS } from "../pages/constants.js";

export function DataTable(props) {
  // For remote pagination, use controlled props; for local, use internal state
  const [internalPage, setInternalPage] = createSignal(1);
  const [internalSort, setInternalSort] = createSignal("");
  const [internalOrder, setInternalOrder] = createSignal("asc");
  const [internalRowsPerPage, setInternalRowsPerPage] = createSignal(props.rowsPerPage || 20);

  const isRemote = props.remote || false;

  // Use controlled props for remote, internal state for local
  const currentPage = () => (isRemote ? props.page || 1 : internalPage());
  const sortColumn = () => (isRemote ? props.sortColumn || "" : internalSort());
  const sortOrder = () => (isRemote ? props.sortOrder || "asc" : internalOrder());
  const rowsPerPage = () => (isRemote ? props.rowsPerPage ?? 20 : internalRowsPerPage());
  const searchQuery = () => props.search || "";

  const processedData = createMemo(() => {
    if (isRemote) {
      // For remote pagination, data is already processed by server
      return props.data || [];
    }

    // Local processing: filter, sort, then paginate
    let data = props.data || [];

    // Filter
    if (searchQuery()) {
      const query = searchQuery().toLowerCase();
      data = data.filter((row) => {
        return props.columns.some((col) => {
          const value = String(row[col.key] || "").toLowerCase();
          return value.includes(query);
        });
      });
    }

    // Sort
    if (sortColumn()) {
      data = [...data].sort((a, b) => {
        const column = sortColumn();
        const order = sortOrder();
        let valA = a[column];
        let valB = b[column];

        // Basic sorting
        let comparison = 0;
        if (typeof valA === "number" && typeof valB === "number") {
          comparison = valA - valB;
        } else {
          const strA = String(valA || "").toLowerCase();
          const strB = String(valB || "").toLowerCase();
          comparison = strA.localeCompare(strB);
        }

        return order === "asc" ? comparison : -comparison;
      });
    }

    // Paginate
    const start = (currentPage() - 1) * rowsPerPage();
    const end = start + rowsPerPage();
    return data.slice(start, end);
  });

  const totalPages = createMemo(() => {
    if (isRemote) {
      // For remote pagination, get total from props
      return Math.ceil((props.totalItems || 0) / rowsPerPage());
      return Math.ceil((props.totalItems || 0) / rowsPerPage());
    } else {
      // For local pagination, calculate from filtered data
      let data = props.data || [];
      if (searchQuery()) {
        const query = searchQuery().toLowerCase();
        data = data.filter((row) => {
          return props.columns.some((col) => {
            const value = String(row[col.key] || "").toLowerCase();
            return value.includes(query);
          });
        });
      }
      return Math.ceil(data.length / rowsPerPage());
    }
  });

  const handleSort = (columnKey) => {
    const newOrder = sortColumn() === columnKey ? (sortOrder() === "asc" ? "desc" : "asc") : "asc";

    if (isRemote) {
      // For remote, call callback - parent manages state
      if (props.onSort) {
        props.onSort({
          column: columnKey,
          order: newOrder,
          page: 1,
          search: searchQuery(),
          });
      }
    } else {
      // For local, update internal state
      setInternalSort(columnKey);
      setInternalOrder(newOrder);
      setInternalPage(1);
    }
  };

  const handlePageChange = (newPage) => {
    if (isRemote) {
      // For remote, call callback - parent manages state
      if (props.onPageChange) {
        props.onPageChange({
          page: newPage,
          search: searchQuery(),
          column: sortColumn(),
          order: sortOrder(),
        });
      }
    } else {
      // For local, update internal state
      setInternalPage(newPage);
    }
  };

  /**
   * Handles the change of the rows per page. If remote, calls the callback provided by the parent.
   * @param {number} newRowsPerPage 
   */
  const handleRowsPerPageChange = (newRowsPerPage) => {
    if (isRemote) {
      if (props.onRowsPerPageChange) {
        props.onRowsPerPageChange({
          rowsPerPage: newRowsPerPage,
          page: 1,
          search: searchQuery(),
          column: sortColumn(),
          order: sortOrder(),
        });
      }
    } else {
      setInternalRowsPerPage(newRowsPerPage);
      setInternalPage(1);
    }
  };

  return html`
    <div class=${() => `table-responsive rounded ${props.className || ""}`}>
      <table class="table table-hover mb-0">
        <thead>
          <tr>
            <${For} each=${() => props.columns}>
              ${(col) => html`
                <th
                  class="user-select-none"
                  classList=${{ [col.className]: true }}
                  onClick=${() => (col.key ? handleSort(col.key) : null)}
                  style=${{ cursor: col.key ? "pointer" : "default" }}
                >
                  ${col.title}
                  ${() => (sortColumn() === col.key ? (sortOrder() === "asc" ? " ↑" : " ↓") : "")}
                </th>
              `}
            <//>
          </tr>
        </thead>
        <tbody>
          <${For}
            each=${processedData}
            fallback=${props.emptyState
              ? props.emptyState
              : html`
                  <tr>
                    <td colspan=${props.columns.length} class="text-center py-4">
                      ${() =>
                        props.loading
                          ? html`
                              <div class="d-flex justify-content-center align-items-center">
                                <div
                                  class="spinner-border spinner-border-sm text-primary me-2"
                                  role="status"
                                >
                                  <span class="visually-hidden">Loading...</span>
                                </div>
                                ${props.loadingText || "Loading..."}
                              </div>
                            `
                          : "No data available."}
                    </td>
                  </tr>
                `}
          >
            ${(row) => html`
              <tr>
                <${For} each=${() => props.columns}>
                  ${(col) => html`
                    <td classList=${{ [col.cellClassName]: true }}>
                      ${col.render ? col.render(row) : row[col.key]}
                    </td>
                  `}
                <//>
              </tr>
            `}
          <//>
        </tbody>
      </table>
    </div>

    <div class="container d-flex justify-content-end align-items-center flex-wrap gap-3 p-2 mt-3">
      <div>Page ${() => (totalPages() === 0 ? 0 : currentPage())} of ${() => totalPages()}</div>
      <div class="d-flex align-items-center gap-2">
        <label for="rows-per-page" class="form-label mb-0 fw-normal">Rows per page:</label>
        <select
          id="rows-per-page"
          class="form-select form-select-sm"
          style="width: auto;"
          value=${() => String(rowsPerPage())}
          onInput=${(e) => handleRowsPerPageChange(Number(e.target.value))}
        >
        <${For} each=${ROWS_PER_PAGE_OPTIONS}>
          ${(option) => html`
            <option value=${option} selected=${() => rowsPerPage() === option}>${option}</option>
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
  `;
}
