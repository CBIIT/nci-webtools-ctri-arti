import { Readable } from "stream";

export const WHITELIST = [
  /\.gov$/i, 
  /\.mil$/i, 
  /\.voanews\.com/i,
  /\.rferl\.org/i,
  /\.rfa\.org/i,
];

export const PROXY_ENDPOINT = "/api/proxy";

export async function proxyMiddleware(req, res) {
  const { headers, method, body, query } = req;
  const host = process.env.DOMAIN_NAME || headers.host;
  const url = new URL(query.url ?? body?.url ?? "");

  if (!WHITELIST.some((regex) => regex.test(url.hostname))) {
    res.statusCode = 403;
    res.end(`Forbidden: Only the following domain patterns are allowed: ${WHITELIST.map((r) => r.source).join(", ")}`);
    return;
  }
  
  try {
    const badRequestHeaders = ["host", "connection", "content-length"];
    badRequestHeaders.forEach((h) => delete headers[h]);
    const response = await fetch(url, { 
      method, 
      headers, 
      body,
      redirect: 'follow'
    });
    
    // Copy response headers, filtering out problematic ones
    const badResponseHeaders = ["content-encoding", "content-length", "content-security-policy", "x-frame-options"];
    response.headers.forEach((value, key) => {
      if (!badResponseHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    
    res.statusCode = response.status;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.match(/text|json|javascript|css|html/)) {
      let text = await response.text();
      // Adjust matching regex if needed (eg: relative URLs)
      text = text.replace(/(https?:\/\/)([^\/\s"']+)/gi, (match, protocol, hostname) => {
        if (hostname === host) return match; // Skip rewriting if the hostname is already our proxy host to avoid infinite loops.
        return `${protocol}${host}${PROXY_ENDPOINT}?url=${encodeURIComponent(match)}`;
      });

      // Set the new content length and return the modified text.
      res.setHeader("Content-Length", Buffer.byteLength(text));
      res.end(text);
    } else {
      // For non-text responses (images, binaries, etc.) use streaming
      if (response.body) {
        Readable.fromWeb(response.body).pipe(res);
      } else {
        res.end();
      }
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.statusCode = 500;
    res.end(`Proxy error: ${error.message}`);
  }
}
