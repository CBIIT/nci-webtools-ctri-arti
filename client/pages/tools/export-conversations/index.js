import JSZip from "jszip";
import { createSignal, createResource, createMemo, createEffect, For, Show } from "solid-js";
import html from "solid-js/html";

import { useAuthContext } from "../../../contexts/auth-context.js";
import { getDB } from "../../../models/database.js";

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(values) {
  return values.map(csvEscape).join(",");
}

function buildConversationsCsv(conversations, idMap, userID) {
  const header = [
    "id",
    "userID",
    "agentID",
    "title",
    "deleted",
    "deletedAt",
    "summaryMessageID",
    "createdAt",
    "updatedAt",
  ];
  const rows = [csvRow(header)];
  for (const conv of conversations) {
    rows.push(
      csvRow([
        idMap.get(conv.id),
        userID || "",
        "",
        conv.title || "",
        false,
        "",
        "",
        conv.created || "",
        conv.updated || "",
      ])
    );
  }
  return rows.join("\n");
}

function buildMessagesCsv(allMessages, convIdMap) {
  const header = ["id", "conversationID", "parentID", "role", "content", "createdAt", "updatedAt"];
  const rows = [csvRow(header)];
  let messageId = 1;
  for (const msg of allMessages) {
    rows.push(
      csvRow([
        messageId++,
        convIdMap.get(msg.conversationId) || "",
        "",
        msg.role || "",
        JSON.stringify(msg.content || []),
        msg.timestamp || msg.created || "",
        msg.updated || "",
      ])
    );
  }
  return rows.join("\n");
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toDateInputValue(iso) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

const STYLES = `
  .export-page {
    --export-accent: rgb(0, 49, 75);
    --export-accent-light: rgb(8, 58, 80);
    --export-surface: #f7f9fb;
    --export-surface-alt: #edf2f7;
    --export-border: #d2dce6;
    --export-text: #1a2b3c;
    --export-text-muted: #5a6e80;
    --export-row-selected: #e8f0fe;
    --export-row-hover: #f0f5fa;
    font-family: "Manrope", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .export-hero {
    background: linear-gradient(135deg, rgb(0, 49, 75) 0%, rgb(13, 38, 72) 50%, rgb(25, 55, 95) 100%);
    border-radius: 0.75rem;
    padding: 2rem 2.25rem;
    color: #fff;
    position: relative;
    overflow: hidden;
  }
  .export-hero::before {
    content: "";
    position: absolute;
    top: -40%;
    right: -10%;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, rgba(58, 117, 189, 0.15) 0%, transparent 70%);
    pointer-events: none;
  }
  .export-hero::after {
    content: "";
    position: absolute;
    bottom: -30%;
    left: 20%;
    width: 300px;
    height: 300px;
    background: radial-gradient(circle, rgba(100, 180, 255, 0.08) 0%, transparent 70%);
    pointer-events: none;
  }

  .export-hero-title {
    font-family: "Montserrat", "Manrope", sans-serif;
    font-weight: 700;
    font-size: 1.5rem;
    letter-spacing: -0.02em;
    margin: 0 0 0.35rem;
    position: relative;
  }
  .export-hero-steps {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
    position: relative;
  }
  .export-hero-step {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    font-size: 0.8125rem;
    opacity: 0.85;
    line-height: 1.4;
  }
  .export-hero-step strong {
    font-weight: 600;
  }
  .export-step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(255,255,255,0.15);
    font-size: 0.6875rem;
    font-weight: 700;
    flex-shrink: 0;
    letter-spacing: 0;
  }
  .export-hero-email {
    color: #90caf9;
    text-decoration: underline;
    text-underline-offset: 2px;
    font-weight: 500;
  }
  .export-hero-email:hover {
    color: #bbdefb;
  }

  .export-stat-row {
    display: flex;
    gap: 1.5rem;
    margin-top: 1.25rem;
    position: relative;
  }
  .export-stat {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }
  .export-stat-value {
    font-family: "Montserrat", monospace;
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .export-stat-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.55;
    font-weight: 500;
  }
  .export-stat-divider {
    width: 1px;
    background: rgba(255,255,255,0.15);
    align-self: stretch;
  }

  .export-filters {
    background: #fff;
    border: 1px solid var(--export-border);
    border-radius: 0.625rem;
    padding: 1.25rem 1.5rem;
    margin-top: 1.25rem;
    display: flex;
    align-items: flex-end;
    gap: 1.25rem;
    flex-wrap: wrap;
  }
  .export-filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
    min-width: 160px;
  }
  .export-filter-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--export-text-muted);
  }
  .export-filter-input {
    border: 1px solid var(--export-border);
    border-radius: 0.4rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    font-family: inherit;
    color: var(--export-text);
    background: var(--export-surface);
    outline: none;
    width: 100%;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .export-filter-input:focus {
    border-color: var(--export-accent);
    box-shadow: 0 0 0 3px rgba(0, 49, 75, 0.08);
  }
  .export-filter-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding-bottom: 1px;
  }
  .export-filter-reset {
    background: none;
    border: none;
    font-size: 0.75rem;
    font-family: inherit;
    color: var(--export-text-muted);
    cursor: pointer;
    padding: 0.5rem 0.75rem;
    border-radius: 0.4rem;
    font-weight: 500;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .export-filter-reset:hover {
    background: var(--export-surface-alt);
    color: var(--export-text);
  }

  .export-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 1.25rem;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .export-selection-info {
    font-size: 0.8125rem;
    color: var(--export-text-muted);
    font-weight: 500;
  }
  .export-selection-info strong {
    color: var(--export-text);
    font-weight: 700;
  }

  .export-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--export-accent);
    color: #fff;
    border: none;
    border-radius: 0.5rem;
    padding: 0.625rem 1.5rem;
    font-family: "Montserrat", "Manrope", sans-serif;
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
  }
  .export-btn:hover:not(:disabled) {
    background: rgb(13, 38, 72);
    box-shadow: 0 4px 12px rgba(0, 49, 75, 0.25);
    transform: translateY(-1px);
  }
  .export-btn:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: none;
  }
  .export-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .export-btn svg {
    flex-shrink: 0;
  }

  .export-table-wrap {
    margin-top: 0.75rem;
    border: 1px solid var(--export-border);
    border-radius: 0.625rem;
    overflow: hidden;
    background: #fff;
  }

  .export-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }
  .export-table thead {
    background: var(--export-accent-light);
    color: #fff;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .export-table thead th {
    padding: 0.75rem 1rem;
    font-weight: 600;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    white-space: nowrap;
    border: none;
    vertical-align: middle;
  }
  .export-table thead th:first-child {
    padding-left: 1.25rem;
    width: 48px;
  }
  .export-table tbody tr {
    border-bottom: 1px solid var(--export-border);
    transition: background-color 0.1s ease;
  }
  .export-table tbody tr:last-child {
    border-bottom: none;
  }
  .export-table tbody tr:hover {
    background: var(--export-row-hover);
  }
  .export-table tbody tr.row-selected {
    background: var(--export-row-selected);
  }
  .export-table tbody td {
    padding: 0.65rem 1rem;
    color: var(--export-text);
    vertical-align: middle;
    border: none;
  }
  .export-table tbody td:first-child {
    padding-left: 1.25rem;
  }

  .export-table .conv-title {
    font-weight: 500;
    color: var(--export-text);
    max-width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .export-table .conv-title-untitled {
    color: var(--export-text-muted);
    font-style: italic;
    font-weight: 400;
  }
  .export-table .conv-meta {
    color: var(--export-text-muted);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }
  .export-table .conv-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    padding: 0.15rem 0.5rem;
    background: var(--export-surface-alt);
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--export-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .export-checkbox {
    appearance: none;
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border: 2px solid var(--export-border);
    border-radius: 3px;
    background: #fff;
    cursor: pointer;
    position: relative;
    transition: background 0.12s ease, border-color 0.12s ease;
    flex-shrink: 0;
  }
  .export-checkbox:checked {
    background: var(--export-accent);
    border-color: var(--export-accent);
  }
  .export-checkbox:checked::after {
    content: "";
    position: absolute;
    left: 3.5px;
    top: 0.5px;
    width: 5px;
    height: 9px;
    border: solid #fff;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  .export-checkbox:indeterminate {
    background: var(--export-accent);
    border-color: var(--export-accent);
  }
  .export-checkbox:indeterminate::after {
    content: "";
    position: absolute;
    left: 2px;
    top: 5px;
    width: 8px;
    height: 2px;
    background: #fff;
    border-radius: 1px;
  }
  thead .export-checkbox {
    border-color: rgba(255,255,255,0.4);
  }
  thead .export-checkbox:checked,
  thead .export-checkbox:indeterminate {
    background: #fff;
    border-color: #fff;
  }
  thead .export-checkbox:checked::after {
    border-color: var(--export-accent);
  }
  thead .export-checkbox:indeterminate::after {
    background: var(--export-accent);
  }

  .export-table-scroll {
    max-height: 520px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--export-border) transparent;
  }

  .export-empty {
    text-align: center;
    padding: 3rem 2rem;
    color: var(--export-text-muted);
  }
  .export-empty-icon {
    font-size: 2.5rem;
    margin-bottom: 0.75rem;
    opacity: 0.3;
  }
  .export-empty-text {
    font-size: 0.9375rem;
    font-weight: 500;
  }
  .export-empty-hint {
    font-size: 0.8125rem;
    margin-top: 0.25rem;
    opacity: 0.7;
  }

  .export-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    gap: 1rem;
    color: var(--export-text-muted);
  }
  .export-loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--export-border);
    border-top-color: var(--export-accent);
    border-radius: 50%;
    animation: export-spin 0.7s linear infinite;
  }
  @keyframes export-spin {
    to { transform: rotate(360deg); }
  }
  .export-loading-text {
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .export-progress {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 3px;
    z-index: 9999;
    background: transparent;
    pointer-events: none;
  }
  .export-progress-bar {
    height: 100%;
    background: linear-gradient(90deg, rgb(58, 117, 189), rgb(100, 180, 255));
    animation: export-progress-anim 1.5s ease-in-out infinite;
    transform-origin: left;
  }
  @keyframes export-progress-anim {
    0% { transform: scaleX(0); opacity: 1; }
    50% { transform: scaleX(0.7); opacity: 1; }
    100% { transform: scaleX(1); opacity: 0; }
  }
`;

// SVG icons as template strings
const DownloadIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const ArchiveIcon = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>`;

export default function ExportConversations() {
  const { user } = useAuthContext();
  const [db, setDb] = createSignal(null);
  const [exporting, setExporting] = createSignal(false);
  const [selected, setSelected] = createSignal(new Set());
  const [dateFrom, setDateFrom] = createSignal("");
  const [dateTo, setDateTo] = createSignal("");
  const [loadError, setLoadError] = createSignal("");

  const [conversations] = createResource(
    () => user()?.email,
    async (email) => {
      if (!email) return [];
      setLoadError("");
      try {
        const database = await getDB(email);
        setDb(database);
        const allConvs = await database.db.getAll("conversations");
        return allConvs.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
      } catch (error) {
        console.error("Failed to load conversations for export:", error);
        setLoadError("Browser storage could not be loaded.");
        setDb(null);
        return [];
      }
    }
  );

  const allConversations = createMemo(() => conversations() || []);

  const tableEmptyMessage = createMemo(() => {
    if (loadError()) {
      return `${loadError()} Showing 0 records.`;
    }
    if (allConversations().length) {
      return "0 records match the selected date range.";
    }
    return "0 records found in browser storage.";
  });

  // Date range boundaries from data
  const dateRange = createMemo(() => {
    const convs = allConversations();
    if (!convs?.length) return { min: "", max: "" };
    const dates = convs
      .map((c) => c.created)
      .filter(Boolean)
      .sort();
    return { min: toDateInputValue(dates[0]), max: toDateInputValue(dates[dates.length - 1]) };
  });

  // Filtered conversations by date range
  const filtered = createMemo(() => {
    const convs = allConversations();
    const from = dateFrom();
    const to = dateTo();
    return convs.filter((c) => {
      const d = c.created ? c.created.slice(0, 10) : "";
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  });

  // Selected count & totals for filtered items
  const selectedConvs = createMemo(() => {
    const sel = selected();
    return filtered().filter((c) => sel.has(c.id));
  });

  const selectedMessageCount = createMemo(() =>
    selectedConvs().reduce((sum, c) => sum + (c.messageCount || 0), 0)
  );

  const totalMessages = createMemo(() =>
    allConversations().reduce((sum, c) => sum + (c.messageCount || 0), 0)
  );

  const allFilteredSelected = createMemo(() => {
    const f = filtered();
    if (!f.length) return false;
    const sel = selected();
    return f.every((c) => sel.has(c.id));
  });

  const someFilteredSelected = createMemo(() => {
    const f = filtered();
    const sel = selected();
    return f.some((c) => sel.has(c.id)) && !allFilteredSelected();
  });

  // Keep a ref for the header checkbox indeterminate state
  let headerCheckboxRef;
  createEffect(() => {
    if (headerCheckboxRef) {
      headerCheckboxRef.indeterminate = someFilteredSelected();
    }
  });

  function toggleAll() {
    const f = filtered();
    if (allFilteredSelected()) {
      const next = new Set(selected());
      f.forEach((c) => next.delete(c.id));
      setSelected(next);
    } else {
      const next = new Set(selected());
      f.forEach((c) => next.add(c.id));
      setSelected(next);
    }
  }

  function toggleOne(id) {
    const next = new Set(selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function resetFilters() {
    setDateFrom("");
    setDateTo("");
  }

  async function handleExport() {
    const database = db();
    const convs = selectedConvs();
    if (!database || !convs.length) return;

    setExporting(true);
    try {
      const convIdMap = new Map();
      convs.forEach((conv, i) => convIdMap.set(conv.id, i + 1));

      const allMessages = [];
      for (const conv of convs) {
        const msgs = await database.db.getAllFromIndex("messages", "conversationId", conv.id);
        const sorted = msgs.sort((a, b) =>
          (a.timestamp || a.created || "").localeCompare(b.timestamp || b.created || "")
        );
        allMessages.push(...sorted);
      }

      const userID = user()?.id || "";
      const convCsv = buildConversationsCsv(convs, convIdMap, userID);
      const msgCsv = buildMessagesCsv(allMessages, convIdMap);

      const zip = new JSZip();
      zip.file("Conversation.csv", convCsv);
      zip.file("Message.csv", msgCsv);

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-v1-export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Check console for details.");
    } finally {
      setExporting(false);
    }
  }

  return html`
    <style>
      ${STYLES}
    </style>
    <${Show} when=${exporting}>
      <div class="export-progress"><div class="export-progress-bar"></div></div>
    <//>

    <div class="export-page container py-4">
      <!-- Hero header -->
      <div class="export-hero">
        <h1 class="export-hero-title">Export Conversations</h1>
        <div class="export-hero-steps">
          <div class="export-hero-step">
            <span class="export-step-num">1</span>
            <span>Select the conversations you want to keep</span>
          </div>
          <div class="export-hero-step">
            <span class="export-step-num">2</span>
            <span>Click <strong>Export to Zip</strong> to download the archive</span>
          </div>
          <div class="export-hero-step">
            <span class="export-step-num">3</span>
            <span
              >Email the zip file <strong>using encryption</strong> to${" "}<a
                href="mailto:ctribresearchoptimizer@mail.nih.gov"
                class="export-hero-email"
                >ctribresearchoptimizer@mail.nih.gov</a
              >${" "}to import your chats into Chat v2</span
            >
          </div>
        </div>
        <div class="export-stat-row">
          <div class="export-stat">
            <span class="export-stat-value">${() => allConversations().length}</span>
            <span class="export-stat-label">Conversations</span>
          </div>
          <div class="export-stat-divider"></div>
          <div class="export-stat">
            <span class="export-stat-value">${() => totalMessages().toLocaleString()}</span>
            <span class="export-stat-label">Messages</span>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <${Show} when=${() => allConversations().length}>
        <div class="export-filters">
          <div class="export-filter-group">
            <label class="export-filter-label">From Date</label>
            <input
              type="date"
              class="export-filter-input"
              value=${dateFrom}
              min=${() => dateRange().min}
              max=${() => dateTo() || dateRange().max}
              onInput=${(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div class="export-filter-group">
            <label class="export-filter-label">To Date</label>
            <input
              type="date"
              class="export-filter-input"
              value=${dateTo}
              min=${() => dateFrom() || dateRange().min}
              max=${() => dateRange().max}
              onInput=${(e) => setDateTo(e.target.value)}
            />
          </div>
          <div class="export-filter-actions">
            <${Show} when=${() => dateFrom() || dateTo()}>
              <button class="export-filter-reset" onClick=${resetFilters}>
                Clear dates
              </button>
            <//>
          </div>
        </div>
      <//>

      <!-- Toolbar -->
      <${Show} when=${() => !conversations.loading}>
        <div class="export-toolbar">
          <div class="export-selection-info">
            ${() => {
              if (loadError()) {
                return html`<span><strong>0</strong> records available for export</span>`;
              }
              const s = selectedConvs().length;
              const f = filtered().length;
              if (!s)
                return html`<span
                  >${f} conversation${f !== 1 ? "s" : ""} shown — select to export</span
                >`;
              return html`
                <span>
                  <strong>${s}</strong> selected (${selectedMessageCount().toLocaleString()}
                  message${selectedMessageCount() !== 1 ? "s" : ""})
                </span>
              `;
            }}
          </div>
          <button
            class="export-btn"
            onClick=${handleExport}
            disabled=${() => exporting() || !selectedConvs().length}
          >
            ${() =>
              exporting()
                ? "Exporting..."
                : html`<span innerHTML=${DownloadIcon}></span> Export
                    ${selectedConvs().length || ""} to Zip`}
          </button>
        </div>
      <//>

      <!-- Loading state -->
      <${Show} when=${() => conversations.loading}>
        <div class="export-table-wrap">
          <div class="export-loading">
            <div class="export-loading-spinner"></div>
            <div class="export-loading-text">Loading conversations from browser storage...</div>
          </div>
        </div>
      <//>

      <!-- Table -->
      <${Show} when=${() => !conversations.loading}>
        <div class="export-table-wrap">
          <div class="export-table-scroll">
            <table class="export-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      class="export-checkbox"
                      ref=${(el) => (headerCheckboxRef = el)}
                      checked=${allFilteredSelected}
                      disabled=${() => !filtered().length}
                      onChange=${(_e) => toggleAll()}
                    />
                  </th>
                  <th>Title</th>
                  <th style="text-align: center;">Messages</th>
                  <th>Created</th>
                  <th>Last Active</th>
                </tr>
              </thead>
              <tbody>
                <${Show} when=${() => filtered().length} fallback=${html`
                  <tr>
                    <td colspan="5">
                      <div class="export-empty">
                        <div class="export-empty-icon" innerHTML=${ArchiveIcon}></div>
                        <div class="export-empty-text">${tableEmptyMessage}</div>
                        <${Show} when=${() => allConversations().length && !loadError()}>
                          <div class="export-empty-hint">Try adjusting or clearing the date filters.</div>
                        <//>
                      </div>
                    </td>
                  </tr>
                `}>
                  <${For} each=${filtered}>
                    ${(conv) => {
                      const isSelected = () => selected().has(conv.id);
                      return html`
                        <tr
                          classList=${() => ({ "row-selected": isSelected() })}
                          onClick=${(_e) => toggleOne(conv.id)}
                          style="cursor: pointer;"
                        >
                          <td>
                            <input
                              type="checkbox"
                              class="export-checkbox"
                              checked=${isSelected}
                              onClick=${(e) => e.stopPropagation()}
                              onChange=${(_e) => toggleOne(conv.id)}
                            />
                          </td>
                          <td>
                            <div
                              classList=${() => ({
                                "conv-title": true,
                                "conv-title-untitled": !conv.title,
                              })}
                            >
                              ${conv.title || "Untitled conversation"}
                            </div>
                          </td>
                          <td style="text-align: center;">
                            <span class="conv-badge">${conv.messageCount || 0}</span>
                          </td>
                          <td class="conv-meta">${formatDate(conv.created)}</td>
                          <td class="conv-meta">${formatDate(conv.lastMessageAt)}</td>
                        </tr>
                      `;
                    }}
                  <//>
                <//>
              </tbody>
            </table>
          </div>
        </div>
      <//>
    </div>
  `;
}
