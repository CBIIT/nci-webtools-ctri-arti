import {
  getEmbeddingsFromResult,
  NOVA_EMBEDDING_MODEL,
  NOVA_RETRIEVAL_PURPOSE,
} from "shared/embeddings.js";
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
  model = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
) {
  if (!topic) return document;

  const maxLength = 500000;
  if (document.length > maxLength) {
    document = document.slice(0, maxLength) + "\n ... (truncated)";
  }

  const system = `You are a research assistant. You will be given a document and a question.
Your task is to answer the question using only the information in the document and provide a fully-verifiable, academic report in markdown format.
If the document doesn't contain information relevant to the question, state this explicitly.`;

  const prompt = `<document>\n${document}\n</document>\n\nAnswer this question about the document: "${topic}"`;
  const messages = [{ role: "user", content: [{ text: prompt }] }];

  const result = await context.gateway.invoke({
    userID: context.userId,
    requestId: context.requestId,
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
 * Editor tool — virtual filesystem backed by CMS Resource table.
 *
 * Scoping:
 * - Merges conversation-scoped + agent-scoped resources; conversation takes precedence by path
 * - Path convention determines scope of NEW resources:
 *     memories/, skills/ → agent-scoped (persist across conversations, user+agent scoped)
 *     everything else    → conversation-scoped
 * - Existing resources are updated in-place (preserving their original scope)
 * - Resources without userID are read-only (system/seed resources)
 * - Returns structured objects { status, path, content, entries, error }
 */
export async function editor(
  { command, path, view_range, old_str, new_str, file_text, insert_line, new_path },
  context
) {
  if (!path) return { status: "error", error: "File path is required" };
  if (!command) return { status: "error", error: "Command is required" };

  const { userId, agentId, conversationId, cms } = context;
  const normPath = path.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
  const isDir = path.endsWith("/");

  // Agent-scoped paths persist across conversations (writable memory)
  function isAgentScoped(p) {
    return p.startsWith("memories/") || p.startsWith("skills/");
  }

  // Merge conversation + agent resources; conversation wins by path
  async function getResources() {
    const [convResources, agentResources] = await Promise.all([
      conversationId ? cms.getResourcesByConversation(userId, conversationId) : [],
      cms.getResourcesByAgent(userId, agentId),
    ]);
    const agentOnly = agentResources.filter((r) => !r.conversationID);
    const byName = new Map();
    for (const r of agentOnly) byName.set(r.name, r);
    for (const r of convResources) byName.set(r.name, r);
    return Array.from(byName.values());
  }

  async function getResource(p) {
    const all = await getResources();
    return all.find((r) => r.name === p);
  }

  function assertWritable(resource) {
    if (!resource.userID)
      return { status: "error", error: `${resource.name} is read-only (system resource)` };
    return null;
  }

  async function saveResource(p, content) {
    const existing = await getResource(p);
    if (existing) {
      const err = assertWritable(existing);
      if (err) return err;
      await cms.updateConversationResource(userId, existing.id, { content });
      return null;
    }
    const resource = { agentID: agentId, name: p, content, type: "file" };
    if (!isAgentScoped(p)) resource.conversationID = conversationId;
    await cms.storeConversationResource(userId, resource);
    return null;
  }

  try {
    switch (command) {
      case "view": {
        const resources = await getResources();
        const file = resources.find((r) => r.name === normPath);
        if (file && !isDir) {
          const content = file.content || "";
          if (view_range) {
            const lines = content.split("\n");
            const [start, end] = view_range;
            const startLine = Math.max(1, start);
            const endLine = end === -1 ? lines.length : Math.min(end, lines.length);
            return {
              status: "viewed",
              path,
              content: lines
                .slice(startLine - 1, endLine)
                .map((line, idx) => `${startLine + idx}: ${line}`)
                .join("\n"),
              resourceId: file.id,
            };
          }
          return { status: "viewed", path, content, resourceId: file.id };
        }

        // List as directory
        const prefix = normPath ? normPath + "/" : "";
        const entries = new Set();
        for (const r of resources) {
          if (r.name.startsWith(prefix)) {
            const rest = r.name.slice(prefix.length);
            const first = rest.split("/")[0];
            if (first) entries.add(rest.includes("/") ? first + "/" : first);
          }
        }
        if (entries.size > 0 || isDir || normPath === "")
          return { status: "directory", path: prefix || "/", entries: Array.from(entries).sort() };
        return { status: "error", error: `Not found: ${path}` };
      }

      case "create": {
        if (!file_text && file_text !== "")
          return { status: "error", error: "file_text is required for create" };
        const existing = await getResource(normPath);
        if (existing)
          return {
            status: "error",
            error: `File already exists: ${path}. Use str_replace to edit.`,
          };
        const resource = { agentID: agentId, name: normPath, content: file_text, type: "file" };
        if (!isAgentScoped(normPath)) resource.conversationID = conversationId;
        const created = await cms.storeConversationResource(userId, resource);
        return { status: "created", path, content: file_text, resourceId: created.id };
      }

      case "str_replace": {
        if (!old_str) return { status: "error", error: "old_str is required for str_replace" };
        if (new_str === undefined)
          return { status: "error", error: "new_str is required for str_replace" };
        const resource = await getResource(normPath);
        if (!resource) return { status: "error", error: `File not found: ${path}` };
        const err = assertWritable(resource);
        if (err) return err;

        const escaped = old_str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const count = (resource.content.match(new RegExp(escaped, "g")) || []).length;
        if (count === 0) return { status: "error", error: "old_str not found in file" };
        if (count > 1)
          return { status: "error", error: `old_str appears ${count} times. Be more specific.` };

        const newContent = resource.content.replace(old_str, new_str);
        await cms.updateConversationResource(userId, resource.id, { content: newContent });
        return { status: "replaced", path, content: newContent, resourceId: resource.id };
      }

      case "insert": {
        if (insert_line === undefined)
          return { status: "error", error: "insert_line is required for insert" };
        if (!new_str && new_str !== "")
          return { status: "error", error: "new_str is required for insert" };
        const resource = await getResource(normPath);
        if (!resource) return { status: "error", error: `File not found: ${path}` };
        const err = assertWritable(resource);
        if (err) return err;

        const lines = resource.content.split("\n");
        const idx = Math.max(0, Math.min(lines.length, insert_line));
        lines.splice(idx, 0, new_str);
        const newContent = lines.join("\n");
        await cms.updateConversationResource(userId, resource.id, { content: newContent });
        return { status: "inserted", path, content: newContent, resourceId: resource.id };
      }

      case "delete": {
        const resource = await getResource(normPath);
        if (!resource) return { status: "error", error: `Not found: ${path}` };
        const err = assertWritable(resource);
        if (err) return err;
        await cms.deleteConversationResource(userId, resource.id);
        return { status: "deleted", path };
      }

      case "rename": {
        if (!new_path) return { status: "error", error: "new_path is required for rename" };
        const resource = await getResource(normPath);
        if (!resource) return { status: "error", error: `Not found: ${path}` };
        const err = assertWritable(resource);
        if (err) return err;
        const newNormPath = new_path.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
        const existing = await getResource(newNormPath);
        if (existing) return { status: "error", error: `Destination already exists: ${new_path}` };
        await cms.updateConversationResource(userId, resource.id, { name: newNormPath });
        return { status: "renamed", old_path: path, new_path, resourceId: resource.id };
      }

      default:
        return { status: "error", error: `Unknown command: ${command}` };
    }
  } catch (error) {
    return { status: "error", error: `${command}: ${error.message}` };
  }
}

/**
 * Think tool — dedicated reasoning space, no file storage needed
 */
export async function think({ thought }) {
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
 * Recall tool — search past conversations and uploaded resources.
 * Always searches everywhere: messages, semantic embeddings, and chunk content.
 */
export async function recall({ query, dateFrom, dateTo }, context) {
  const { userId, agentId, cms, gateway } = context;
  const limit = 10;
  const results = {};

  const buildConversationUrl = (resultAgentId, conversationId) =>
    resultAgentId && conversationId
      ? `/tools/chat-v2?agentId=${resultAgentId}&conversationId=${conversationId}`
      : null;

  const buildResourceDownloadInfo = (resource) => {
    const metadata = resource?.metadata || {};
    const format = (
      metadata.format ||
      resource?.resourceName?.split(".").pop() ||
      ""
    ).toLowerCase();
    const exactFormats = new Set(["txt", "md", "csv", "json", "html", "htm", "xml"]);
    const downloadExact = metadata.encoding === "base64" || exactFormats.has(format);

    return {
      downloadUrl: resource?.resourceId
        ? `/api/v1/resources/${resource.resourceId}/download`
        : null,
      resourceUrl: resource?.resourceId ? `/api/v1/resources/${resource.resourceId}` : null,
      downloadExact,
      downloadLabel: downloadExact ? "Download resource" : "Download stored text",
    };
  };

  await Promise.all([
    cms.searchMessages(userId, { query, agentId, dateFrom, dateTo, limit }).then((r) => {
      results.messages = r;
    }),
    (async () => {
      try {
        const embedResult = await gateway.embed({
          userID: userId,
          requestId: context.requestId,
          model: NOVA_EMBEDDING_MODEL,
          content: [query],
          purpose: NOVA_RETRIEVAL_PURPOSE,
          type: "embedding",
        });
        const [queryEmbedding] = getEmbeddingsFromResult(embedResult, { expectedCount: 1 });
        if (queryEmbedding) {
          results.semantic = await cms.searchResourceVectors(userId, {
            embedding: queryEmbedding,
            topN: limit,
            dateFrom,
            dateTo,
          });
        }
      } catch (err) {
        results.semantic = { error: err.message };
      }
    })(),
    cms.searchChunks(userId, { query, dateFrom, dateTo, limit }).then((r) => {
      results.chunks = r;
    }),
  ]);

  return {
    query,
    generatedAt: new Date().toISOString(),
    messages:
      results.messages?.map((message) => ({
        ...message,
        conversationUrl: buildConversationUrl(message.agentId, message.conversationId),
        matchingText: message.matchingText?.slice(0, 500) || "",
      })) || [],
    semantic:
      results.semantic?.length && !results.semantic.error
        ? results.semantic.map((resource) => ({
            ...resource,
            ...buildResourceDownloadInfo(resource),
            conversationUrl: buildConversationUrl(resource.agentId, resource.conversationId),
            excerpt: resource.content?.slice(0, 500) || "",
          }))
        : [],
    chunks:
      results.chunks?.map((resource) => ({
        ...resource,
        ...buildResourceDownloadInfo(resource),
        conversationUrl: buildConversationUrl(resource.agentId, resource.conversationId),
        excerpt: resource.content?.slice(0, 500) || "",
      })) || [],
    errors: results.semantic?.error ? { semantic: results.semantic.error } : {},
    summary: {
      messageCount: results.messages?.length || 0,
      semanticCount: Array.isArray(results.semantic) ? results.semantic.length : 0,
      chunkCount: results.chunks?.length || 0,
    },
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
  recall,
};

export function getToolFn(name) {
  return toolImplementations[name];
}
