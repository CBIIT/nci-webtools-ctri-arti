import { Readable } from "stream";

export async function proxyMiddleware(req, res) {
  const { headers, method, body, query } = req;
  const url = new URL(query.url ?? body?.url ?? "");
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
