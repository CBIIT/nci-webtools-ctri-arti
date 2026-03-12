import { parseDocument } from "shared/parsers.js";
import { listFiles, getFile } from "shared/s3.js";
import { search as searchWeb } from "shared/search.js";

const { S3_BUCKETS } = process.env;

/**
 * Search tool — calls Brave + gov search APIs
 */
export async function search({ query }) {
  const data = await searchWeb({ q: query });
  const extract = (r) => ({
    url: r.url,
    title: r.title,
    description: r.description,
    extra_snippets: r.extra_snippets,
    age: r.age,
    page_age: r.page_age,
    article: r.article,
  });
  return {
    web: data.web?.web?.results?.map(extract),
    news: data.news?.results?.map(extract),
    gov: data.gov?.results,
  };
}

/**
 * Browse tool — fetch URLs, parse documents, optional model query
 */
export async function browse({ url, topic }, context) {
  const urls = Array.isArray(url) ? url : [url];
  if (urls.length === 0) return "No URLs provided";

  const results = await Promise.all(
    urls.map(async (u) => {
      try {
        const response = await fetch(u);
        if (!response.ok) {
          return `Failed to read ${u}: ${response.status} ${response.statusText}`;
        }
        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get("content-type") || "text/html";
        const text = await parseServerDocument(Buffer.from(buffer), contentType, u);

        const finalResults = !topic
          ? text
          : await queryDocumentWithModel(`<url>${u}</url>\n<text>${text}</text>`, topic, context);
        return ["## " + u, finalResults].join("\n\n");
      } catch (error) {
        return `Failed to read ${u}: ${error.message}`;
      }
    })
  );
  return results.join("\n\n---\n\n");
}

/**
 * Parse document on the server side — handles HTML, PDF, DOCX, and plain text
 */
async function parseServerDocument(buffer, contentType, url) {
  if (contentType.includes("text/html")) {
    const text = buffer.toString("utf-8");
    // Simple HTML-to-text: strip tags
    return text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (contentType.includes("text/plain")) {
    return buffer.toString("utf-8");
  }
  // PDF and DOCX handled by shared parsers
  try {
    return await parseDocument(buffer, contentType);
  } catch {
    return `[Document from ${url} - ${contentType}]`;
  }
}

/**
 * Query document content using a cheap model (non-streaming)
 */
async function queryDocumentWithModel(
  document,
  topic,
  context,
  model = "us.meta.llama4-maverick-17b-instruct-v1:0"
) {
  if (!topic) return document;

  const maxLength = 500000;
  if (document.length > maxLength) {
    document = document.slice(0, maxLength) + "\n ... (truncated)";
  }

  const system = `You are a research assistant. You will be given a document and a question.
Your task is to answer the question using only the information in the document and provide a fully-verifiable, academic report in markdown format.
If the document doesn't contain information relevant to the question, state this explicitly.`;

  const prompt = `Answer this question about the document: "${topic}"`;
  const messages = [{ role: "user", content: [{ text: prompt }] }];

  const result = await context.gateway.invoke({
    userID: context.userId,
    model,
    messages,
    system,
    type: "browse-query",
  });
  return result?.output?.message?.content?.[0]?.text || document;
}

/**
 * Data tool — access S3 bucket files
 */
export async function data({ bucket, key }) {
  if (S3_BUCKETS && !S3_BUCKETS.split(",").includes(bucket)) {
    throw new Error("Invalid bucket");
  }

  if (!key || key.endsWith("/")) {
    return await listFiles(bucket);
  }

  const fileData = await getFile(bucket, key);
  const contentType = fileData.ContentType || getMimeTypeFromKey(key);

  // Parse document types that need text extraction
  const documentTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (documentTypes.includes(contentType)) {
    const chunks = [];
    for await (const chunk of fileData.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return await parseDocument(buffer, contentType);
  }

  // For other files, read as text
  const chunks = [];
  for await (const chunk of fileData.Body) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf-8");

  if (key.endsWith(".json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return text;
}

function getMimeTypeFromKey(key) {
  const ext = key.split(".").pop()?.toLowerCase();
  const mimeTypes = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    json: "application/json",
    csv: "text/csv",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Editor tool — uses CMS Resource table for per-agent file storage
 */
export async function editor(
  { command, path, view_range, old_str, new_str, file_text, insert_line },
  context
) {
  if (!path) return "Error: File path is required";
  if (!command) return "Error: Command is required";

  const { userId, agentId, cms } = context;

  const normalizeNewlines = (text) => {
    if (typeof text !== "string") return "";
    return text.replace(/\r\n/g, "\n");
  };

  // Helper to load resource content by path
  async function getResourceByPath(filePath) {
    const resources = await cms.getResourcesByAgent(userId, agentId);
    return resources.find((r) => r.name === filePath);
  }

  try {
    switch (command) {
      case "view": {
        const resource = await getResourceByPath(path);
        if (!resource) return `File not found: ${path}`;
        const content = normalizeNewlines(resource.content || "");
        const lines = content.split("\n");
        const [start, end] = view_range || [1, lines.length];
        const startLine = Math.max(1, start);
        const endLine = end === -1 ? lines.length : Math.min(end, lines.length);
        return lines
          .slice(startLine - 1, endLine)
          .map((line, idx) => `${startLine + idx}: ${line}`)
          .join("\n");
      }

      case "create": {
        const fileContent = file_text !== undefined ? normalizeNewlines(file_text) : "";
        const existing = await getResourceByPath(path);
        if (existing) {
          // Overwrite: delete old, create new
          await cms.deleteResource(userId, existing.id);
        }
        await cms.addResource(userId, {
          agentID: agentId,
          name: path,
          content: fileContent,
          type: "file",
        });
        return existing ? `Overwrote existing file: ${path}` : `Successfully created file: ${path}`;
      }

      case "str_replace": {
        if (old_str === undefined) return "Error: old_str parameter is required for str_replace";
        if (new_str === undefined) return "Error: new_str parameter is required for str_replace";

        const resource = await getResourceByPath(path);
        if (!resource) return `File not found: ${path}`;

        const content = normalizeNewlines(resource.content || "");
        const normalizedOldStr = normalizeNewlines(old_str);

        let count = 0;
        let position = 0;
        while (true) {
          position = content.indexOf(normalizedOldStr, position);
          if (position === -1) break;
          count++;
          if (normalizedOldStr === "") break;
          position += normalizedOldStr.length;
        }

        if (count === 0) return "The specified text was not found in the file.";
        if (count > 1)
          return `Found ${count} occurrences of the text. The replacement must match exactly one location.`;

        // Store undo history as a separate resource
        await cms.addResource(userId, {
          agentID: agentId,
          name: `_history:${path}`,
          content: resource.content,
          type: "history",
        });

        const newContent = content.replace(normalizedOldStr, normalizeNewlines(new_str));
        await cms.deleteResource(userId, resource.id);
        await cms.addResource(userId, {
          agentID: agentId,
          name: path,
          content: newContent,
          type: "file",
        });
        return "Successfully replaced text at exactly one location.";
      }

      case "insert": {
        if (new_str === undefined) return "Error: new_str parameter is required for insert";
        if (insert_line === undefined) return "Error: insert_line parameter is required for insert";

        const resource = await getResourceByPath(path);
        if (!resource) return `File not found: ${path}`;

        // Store undo history
        await cms.addResource(userId, {
          agentID: agentId,
          name: `_history:${path}`,
          content: resource.content,
          type: "history",
        });

        const content = normalizeNewlines(resource.content || "");
        const lines = content.split("\n");
        const insertLineIndex = Math.min(Math.max(0, insert_line), lines.length);
        const linesToInsert = normalizeNewlines(new_str).split("\n");
        lines.splice(insertLineIndex, 0, ...linesToInsert);

        await cms.deleteResource(userId, resource.id);
        await cms.addResource(userId, {
          agentID: agentId,
          name: path,
          content: lines.join("\n"),
          type: "file",
        });
        return `Successfully inserted text after line ${insertLineIndex}.`;
      }

      case "undo_edit": {
        const historyResource = await getResourceByPath(`_history:${path}`);
        if (!historyResource) return `No previous edit found for file: ${path}`;

        const resource = await getResourceByPath(path);
        if (resource) {
          await cms.deleteResource(userId, resource.id);
        }
        await cms.addResource(userId, {
          agentID: agentId,
          name: path,
          content: historyResource.content,
          type: "file",
        });
        await cms.deleteResource(userId, historyResource.id);
        return `Successfully reverted last edit for file: ${path}`;
      }

      default:
        return `Error: Unknown command: ${command}`;
    }
  } catch (error) {
    return `Error processing command ${command}: ${error.message}`;
  }
}

/**
 * Think tool — wraps editor, appends to _thoughts.txt
 */
export async function think({ thought }, context) {
  await editor(
    {
      command: "create",
      path: "_thoughts.txt",
      file_text: thought,
    },
    context
  );
  return "Thinking complete.";
}

/**
 * DocxTemplate tool — fetch DOCX, extract blocks or apply replacements
 */
export async function docxTemplate({ docxUrl, replacements }, context) {
  const { convertToHtml } = await import("mammoth");

  let templateBuffer;

  if (docxUrl.startsWith("s3://")) {
    const s3Match = docxUrl.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!s3Match) throw new Error("Invalid S3 URL format. Expected: s3://bucket/key");
    const [, bucket, key] = s3Match;
    const fileData = await getFile(bucket, key);
    const chunks = [];
    for await (const chunk of fileData.Body) {
      chunks.push(chunk);
    }
    templateBuffer = Buffer.concat(chunks);
  } else {
    const response = await fetch(docxUrl);
    if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
    templateBuffer = Buffer.from(await response.arrayBuffer());
  }

  // Discovery mode: return document blocks with metadata
  if (!replacements) {
    const { docxExtractTextBlocks } = await import("shared/parsers.js");
    // If shared doesn't have docxExtractTextBlocks, fall back to mammoth
    const result = await convertToHtml({ buffer: templateBuffer });
    return { html: result.value, templateDownloadUrl: docxUrl };
  }

  // Replace mode: apply replacements and return HTML preview
  // Simple text replacement in the DOCX
  const result = await convertToHtml({ buffer: templateBuffer });
  let html = result.value;
  for (const [key, value] of Object.entries(replacements)) {
    if (key.startsWith("@")) continue; // index-based replacements need block processing
    html = html.replace(key, value);
  }

  return {
    html,
    warnings: result.messages.filter((m) => m.type === "warning").map((m) => m.message),
  };
}

/**
 * Tool registry — maps tool names to their implementations
 */
export const toolImplementations = {
  search,
  browse,
  data,
  editor,
  think,
  docxTemplate,
};

export function getToolFn(name) {
  return toolImplementations[name];
}
