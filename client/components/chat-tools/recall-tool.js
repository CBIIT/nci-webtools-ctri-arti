import { History } from "lucide-solid";
import { parse } from "marked";
import { For, Show } from "solid-js";
import html from "solid-js/html";

import { getToolResult } from "../../utils/tools.js";

import ToolHeader from "./tool-header.js";

export default function RecallTool(props) {
  const result = () => getToolResult(props.message?.toolUse, props.messages) || "";
  const structured = () =>
    result() && typeof result() === "object" && !Array.isArray(result()) ? result() : null;
  const totalCount = () => {
    const data = structured();
    if (!data) return sectionCount();
    return (data.messages?.length || 0) + (data.semantic?.length || 0) + (data.chunks?.length || 0);
  };

  const sectionCount = () => {
    const text = result();
    if (!text) return 0;
    return (text.match(/^## /gm) || []).length;
  };

  const formatTimestamp = (value) => {
    const parsed = value ? new Date(value) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString() : value || "";
  };

  const sections = () => {
    const data = structured();
    if (!data) return [];
    return [
      { key: "messages", title: "Messages", metric: "rank", items: data.messages || [] },
      {
        key: "semantic",
        title: "Semantic Matches",
        metric: "similarity",
        items: data.semantic || [],
      },
      { key: "chunks", title: "Chunk Matches", metric: "rank", items: data.chunks || [] },
    ].filter((section) => section.items.length > 0);
  };

  const renderItem = (section, item) => {
    const similarityText =
      typeof item.similarity === "number"
        ? `Similarity ${(item.similarity * 100).toFixed(1)}%`
        : "";
    const rankText = typeof item.rank === "number" ? `Rank ${item.rank.toFixed(2)}` : "";

    return html`<article class="border rounded-3 p-2 bg-white">
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <div class="fw-semibold text-body-emphasis">
          ${item.conversationTitle || item.resourceName || "Untitled"}
        </div>
        <div class="d-flex flex-wrap gap-2 text-muted-contrast">
          <span>#${item.messageId || item.resourceId || item.id}</span>
          <${Show} when=${section.metric === "similarity" && similarityText}>
            <span>${similarityText}</span>
          <//>
          <${Show} when=${section.metric === "rank" && rankText}>
            <span>${rankText}</span>
          <//>
        </div>
      </div>

      <div class="text-muted-contrast mb-2">
        <${Show} when=${item.createdAt}>
          <div>Matched: ${formatTimestamp(item.createdAt)}</div>
        <//>
        <${Show} when=${item.resourceCreatedAt}>
          <div>Resource: ${formatTimestamp(item.resourceCreatedAt)}</div>
        <//>
      </div>

      <pre class="reasoning-pre text-prewrap mb-2">
${item.matchingText || item.excerpt || item.content || ""}</pre
      >

      <div class="d-flex flex-wrap gap-3">
        <${Show} when=${item.conversationUrl}>
          <a
            href=${item.conversationUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="link-primary"
            >Open conversation</a
          >
        <//>
        <${Show} when=${item.resourceUrl}>
          <a href=${item.resourceUrl} target="_blank" rel="noopener noreferrer" class="link-primary"
            >Resource JSON</a
          >
        <//>
        <${Show} when=${item.downloadUrl}>
          <a
            href=${item.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            class="link-primary"
          >
            ${item.downloadLabel || "Download resource"}
          </a>
        <//>
      </div>

      <${Show} when=${item.downloadExact === false}>
        <div class="text-muted-contrast mt-2">
          Original binary was not preserved for this resource; download returns the stored text
          representation.
        </div>
      <//>
    </article>`;
  };

  const renderStructured = () => {
    const data = structured();
    if (!data) return null;

    return html`<div class="p-2 d-grid gap-3 small">
      <${Show} when=${() => Object.keys(data.errors || {}).length > 0}>
        <div class="alert alert-warning py-2 mb-0">
          ${Object.entries(data.errors)
            .map(([key, value]) => `${key}: ${value}`)
            .join(" | ")}
        </div>
      <//>

      <${Show} when=${() => totalCount() === 0}>
        <div class="text-muted-contrast">No recall results for this query.</div>
      <//>

      <${For} each=${sections}>
        ${(section) =>
          html`<section class="d-grid gap-2">
            <div class="fw-semibold text-body-emphasis">${section.title}</div>
            <${For} each=${section.items}>${(item) => renderItem(section, item)}<//>
          </section>`}
      <//>
    </div>`;
  };

  return html`<article
    class="search-accordion border rounded-3 my-3 min-w-0"
    classList=${() => ({ "is-open": props.isOpen(), "shadow-sm bg-light": props.isOpen() })}
  >
    ${ToolHeader({
      icon: html`<${History} size="16" class="text-muted-contrast" />`,
      title: () => props.message?.toolUse?.input?.query || "Searching history...",
      right: () =>
        html`<small class="text-muted-contrast">
          ${() => {
            const n = totalCount();
            return n ? `${n} source${n > 1 ? "s" : ""}` : "";
          }}
        </small>`,
      isOpen: props.isOpen,
      onToggle: props.onToggle,
      bodyId: props.bodyId,
    })}

    <div
      id=${props.bodyId}
      class="search-accordion__body"
      classList=${() => ({ show: props.isOpen() })}
    >
      <div class="accordion-inner">
        <div class="mask-fade-bottom">
          <div class="overflow-auto pe-1 search-accordion__scroll">
            <${Show}
              when=${structured}
              fallback=${html`<div class="p-2">
                <div
                  class="markdown"
                  innerHTML=${() => parse(typeof result() === "string" ? result() : "")}
                />
              </div>`}
            >
              ${renderStructured}
            <//>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}
