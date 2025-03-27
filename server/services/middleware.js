import { Readable } from "stream";

export const WHITELIST = [/.*/i];
export const PROXY_ENDPOINT = "/api/proxy";

/**
 * A simplified proxy middleware that fetches remote content without complex rewriting
 */
export async function proxyMiddleware(req, res, next) {
  const { headers, method, body } = req;
  const host = headers.host?.split(":")[0];
  
  // Extract URL from path parameters
  let urlString = "";
  let params = {...req.params, ...req.query, ...req.body};
  if (params && params.url) {
    urlString = Array.isArray(params.url) 
      ? params.url.filter(Boolean).join("/") 
      : params.url;
    
    // Add protocol if missing
    if (!/^https?:\/\//i.test(urlString)) {
      urlString = 'https://' + urlString;
    }
  }
  
  if (!urlString) {
    res.status(400).send("Bad Request: No URL provided");
    return;
  }

  // Parse the URL
  let url;
  try {
    url = new URL(urlString);
  } catch (error) {
    res.status(400).send(`Invalid URL: ${error.message}`);
    return;
  }

  // Only allow requests if the hostname matches or is on the whitelist
  if (!WHITELIST.some((regex) => regex.test(url.hostname)) && url.hostname !== host) {
    res.status(403).send("Forbidden: Domain not allowed");
    return;
  }
  
  try {
    // Filter out problematic headers
    const cleanHeaders = { ...headers };
    ["host", "connection", "content-length"].forEach(h => delete cleanHeaders[h]);
    
    // Fetch the remote content
    const response = await fetch(url.toString(), { 
      method, 
      headers: cleanHeaders, 
      body,
      redirect: 'follow'
    });
    
    // Copy status code
    res.status(response.status);
    
    // Copy essential headers
    res.setHeader("Content-Type", response.headers.get("content-type") || "");
    
    // For text responses, stream directly without rewriting
    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).send(`Proxy error: ${error.message}`);
  }
}