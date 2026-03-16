import { Download, File, Folder } from "lucide-solid";
import { parse } from "marked";
import { Show } from "solid-js";
import html from "solid-js/html";

import { downloadText } from "../../utils/files.js";
import { getToolResult } from "../../utils/tools.js";
import Tooltip from "../tooltip.js";

import ToolHeader from "./tool-header.js";

function getExtension(path) {
  const dot = path?.lastIndexOf(".");
  return dot > 0 ? path.slice(dot).toLowerCase() : "";
}

function computeDiffLines(oldText, newText) {
  const oldLines = (oldText || "").split("\n");
  const newLines = (newText || "").split("\n");
  const diff = [];
  let oi = 0,
    ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      diff.push({ type: "same", text: newLines[ni], lineNum: ni + 1 });
      oi++;
      ni++;
    } else {
      let matchOi = -1,
        matchNi = -1;
      const searchLimit = Math.min(50, Math.max(oldLines.length - oi, newLines.length - ni));
      outer: for (let span = 1; span <= searchLimit; span++) {
        for (let a = 0; a <= span; a++) {
          const b = span - a;
          if (
            oi + a < oldLines.length &&
            ni + b < newLines.length &&
            oldLines[oi + a] === newLines[ni + b]
          ) {
            matchOi = oi + a;
            matchNi = ni + b;
            break outer;
          }
        }
      }

      if (matchOi === -1) {
        while (oi < oldLines.length) diff.push({ type: "removed", text: oldLines[oi++] });
        while (ni < newLines.length) {
          diff.push({ type: "added", text: newLines[ni], lineNum: ni + 1 });
          ni++;
        }
      } else {
        while (oi < matchOi) diff.push({ type: "removed", text: oldLines[oi++] });
        while (ni < matchNi) {
          diff.push({ type: "added", text: newLines[ni], lineNum: ni + 1 });
          ni++;
        }
      }
    }
  }
  return diff;
}

function renderDiffHtml(diffLines) {
  return diffLines
    .map((d) => {
      const cls =
        d.type === "removed"
          ? "editor-diff-removed"
          : d.type === "added"
            ? "editor-diff-added"
            : "";
      const num = d.type === "removed" ? "" : d.lineNum || "";
      return `<span class="editor-diff-line ${cls}"><span class="editor-diff-line-number">${num}</span>${escapeHtml(d.text)}</span>`;
    })
    .join("\n");
}

function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function EditorTool(props) {
  const getFilename = () => props.message?.toolUse?.input?.path || "untitled.txt";
  const command = () => props.message?.toolUse?.input?.command;
  const ext = () => getExtension(getFilename());

  const result = () => getToolResult(props.message?.toolUse, props.messages);

  const content = () => {
    const r = result();
    if (r?.content != null) return r.content;
    return (
      localStorage.getItem(`file:${getFilename()}`) ||
      props.message?.toolUse?.input?.file_text ||
      props.message?.toolUse?.input?.new_str ||
      ""
    );
  };

  const isDirectory = () => result()?.status === "directory";
  const dirEntries = () => result()?.entries || [];
  const resourceId = () => result()?.resourceId;

  const title = () => {
    if (isDirectory()) return "Listing";
    return (
      {
        view: "Viewing",
        str_replace: "Updating",
        create: "Creating",
        insert: "Updating",
        delete: "Deleting",
        rename: "Renaming",
        undo_edit: "Undoing Edit",
      }[command()] || "Editing"
    );
  };

  const icon = () =>
    isDirectory()
      ? html`<${Folder} size="16" class="text-muted-contrast" />`
      : html`<${File} size="16" class="text-muted-contrast" />`;

  const isDiffCommand = () => command() === "str_replace" || command() === "insert";

  const diffContent = () => {
    if (!isDiffCommand()) return null;
    const postEdit = content();
    if (!postEdit) return null;
    const input = props.message?.toolUse?.input;

    if (command() === "str_replace") {
      const oldStr = input?.old_str || "";
      const newStr = input?.new_str || "";
      const preEdit = postEdit.replace(newStr, oldStr);
      return computeDiffLines(preEdit, postEdit);
    }

    if (command() === "insert") {
      const insertedLines = new Set();
      const insertLine = input?.insert_line ?? 0;
      const newStrLines = (input?.new_str || "").split("\n").length;
      for (let i = 0; i < newStrLines; i++) insertedLines.add(insertLine + i);
      const lines = postEdit.split("\n");
      return lines.map((text, i) => ({
        type: insertedLines.has(i) ? "added" : "same",
        text,
        lineNum: i + 1,
      }));
    }
    return null;
  };

  const renderContent = () => {
    // Directory listing
    if (isDirectory()) {
      const entries = dirEntries();
      if (entries.length === 0)
        return html`<div class="content-prose text-muted">Empty directory</div>`;
      return html`<div class="content-prose">
        ${entries.map(
          (e) =>
            html`<div class="d-flex align-items-center gap-2 py-1">
              <${e.endsWith("/") ? Folder : File}
                size="14"
                class="text-muted-contrast flex-shrink-0"
              />
              <span>${e}</span>
            </div>`
        )}
      </div>`;
    }

    // Diff view for edits
    const diff = diffContent();
    if (diff) {
      return html`<div
        class="content-prose"
        style="white-space: pre-wrap;"
        innerHTML=${renderDiffHtml(diff)}
      />`;
    }

    const text = content();
    const extension = ext();

    // Markdown: rendered HTML
    if (extension === ".md") {
      return html`<div class="content-markdown" innerHTML=${parse(text || "")} />`;
    }

    // Plain text / everything else: readable proportional font
    return html`<div class="content-prose">${text}</div>`;
  };

  async function handleDownload() {
    const rid = resourceId();
    if (rid) {
      try {
        const res = await fetch(`/api/v1/resources/${rid}`);
        const data = await res.json();
        downloadText(getFilename() || "file.txt", data.content || "");
        return;
      } catch (e) {
        console.error("Download from API failed, falling back to local", e);
      }
    }
    downloadText(getFilename() || "file.txt", content() || "");
  }

  const showDownload = () =>
    command() !== "delete" &&
    !isDirectory() &&
    typeof content() === "string" &&
    content().length > 0;

  return html`<article
    class="search-accordion editor-accordion border rounded-3 my-3 min-w-0"
    classList=${() => ({ "is-open": props.isOpen(), "shadow-sm bg-light": props.isOpen() })}
  >
    ${ToolHeader({
      icon: icon,
      title: html` ${title}
        <small class="text-muted-contrast ms-2 text-truncate d-none d-sm-inline">
          ${() =>
            isDirectory() ? `Directory: ${getFilename()}` : `File: ${getFilename() || "untitled"}`}
        </small>`,
      right: html`
        <div class="btn-group btn-group-sm" role="group">
          <${Show} when=${showDownload}>
            <${Tooltip}
              title="Download file"
              placement="top"
              arrow=${true}
              class="text-white bg-primary"
            >
              <button
                type="button"
                class="btn btn-unstyled tool-btn-icon text-muted-contrast"
                title="Download"
                onClick=${handleDownload}
              >
                <${Download} size="16" />
              </button>
            <//>
          <//>
        </div>
      `,
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
            <div class="p-2">${renderContent}</div>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}
