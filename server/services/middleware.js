import { Readable } from "stream";

export const WHITELIST = [/\.gov$/i, /\.mil$/i];

export async function proxyMiddleware(req, res) {
  const { headers, method, body, query } = req;
  const url = new URL(query.url ?? body?.url ?? "");
  if (!WHITELIST.some((regex) => regex.test(url.hostname))) {
    res.statusCode = 403;
    res.end(`Forbidden: Only the following domain patterns are allowed: ${WHITELIST.map((r) => r.source).join(", ")}`);
    return
  }
  const badRequestHeaders = ["host", "connection", "content-length"];
  const badResponseHeaders = ["content-encoding", "content-length"];
  badRequestHeaders.forEach((h) => delete headers[h]);
  const response = await fetch(url, { method, headers, body });
  response.headers.forEach((value, key) => !badResponseHeaders.includes(key.toLowerCase()) && res.setHeader(key, value));
  res.statusCode = response.status;
  if (response.body) {
    Readable.fromWeb(response.body).pipe(res);
  } else {
    res.end();
  }
}
