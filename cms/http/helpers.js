import { readInternalRequestContext } from "shared/request-context.js";
import { routeHandler } from "shared/utils.js";

export const JSON_UPLOAD_LIMIT = 1024 ** 3;

const TEXT_DOWNLOAD_FORMATS = new Set(["txt", "md", "html", "htm", "csv", "json", "xml"]);
const RESOURCE_MIME_TYPES = {
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export function readRequestContext(req, { required = true } = {}) {
  return readInternalRequestContext(req.headers, { required });
}

export function withResolvedContext(resolveContext, handler, options) {
  return routeHandler(async (req, res) => {
    req.context = resolveContext(req, options);
    return handler(req, res);
  });
}

export async function streamResponse(res, stream) {
  for await (const message of stream) {
    res.write(JSON.stringify(message) + "\n");
  }
  res.end();
}

export function parseEmbeddingQuery(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) value = value[0];
  return JSON.parse(value);
}

export function sendNotFound(res, label) {
  return res.status(404).json({ error: `${label} not found` });
}

export function parsePageQuery(query = {}) {
  return {
    limit: parseInt(query.limit, 10) || 20,
    offset: parseInt(query.offset, 10) || 0,
  };
}

function getResourceFormat(resource) {
  return (resource?.metadata?.format || resource?.name?.split(".").pop() || "").toLowerCase();
}

function getMimeTypeFromResource(resource) {
  const format = getResourceFormat(resource);

  if (resource?.metadata?.encoding === "base64") {
    return RESOURCE_MIME_TYPES[format] || "application/octet-stream";
  }

  if (TEXT_DOWNLOAD_FORMATS.has(format)) {
    return RESOURCE_MIME_TYPES[format];
  }

  return "text/plain; charset=utf-8";
}

function getDownloadFilename(resource) {
  const name = resource?.name || `resource-${resource?.id || "download"}`;
  const format = getResourceFormat(resource) || name.split(".").pop()?.toLowerCase() || "";

  if (resource?.metadata?.encoding === "base64" || TEXT_DOWNLOAD_FORMATS.has(format)) {
    return name;
  }

  return name.endsWith(".txt") ? name : `${name}.txt`;
}

export function sendResourceDownload(res, resource) {
  const filename = getDownloadFilename(resource);
  const contentType = getMimeTypeFromResource(resource);
  const content =
    resource?.metadata?.encoding === "base64"
      ? Buffer.from(resource.content || "", "base64")
      : Buffer.from(resource.content || "", "utf-8");

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(content);
}
