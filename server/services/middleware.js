import { Readable } from "stream";
import { JSDOM } from "jsdom";

export const WHITELIST = [/.*/i];

export const PROXY_ENDPOINT = "/api/proxy";

/**
 * proxyMiddleware - Proxies the request, fetching the remote content and rewriting it.
 */
export async function proxyMiddleware(req, res, next) {
  const { headers, method, body, query } = req;
  const host = headers.host?.split(":")[0];

  // Handle URL from various sources, including wildcard path parameters
  let urlString;
  
  // Check if we're dealing with a wildcard path from Express
  if (req.params && req.params.url) {
    // Handle both string and array formats of the url parameter
    if (Array.isArray(req.params.url)) {
      urlString = req.params.url.filter(Boolean).join("/");
    } else {
      urlString = req.params.url;
    }
    
    // Ensure the URL is absolute
    if (!/^https?:\/\//i.test(urlString)) {
      urlString = 'https://' + urlString;
    }
  } else {
    // Fallback to query or body parameters
    urlString = query.url ?? body?.url ?? "";
  }
  
  if (!urlString) {
    res.statusCode = 400;
    res.end("Bad Request: No URL provided");
    return;
  }

  // Parse the URL
  let url;
  try {
    url = new URL(urlString);
    
    // Merge any additional query parameters from the original request
    // Only if they didn't come from the path
    if (!req.params || !req.params.url) {
      for (const [key, value] of Object.entries(req.query)) {
        if (key !== 'url') {
          url.searchParams.set(key, value);
        }
      }
    }
  } catch (error) {
    res.statusCode = 400;
    res.end(`Invalid URL: ${error.message}`);
    return;
  }

  // Unwrap double proxied URLs
  while (url.pathname.startsWith(PROXY_ENDPOINT)) {
    try {
      url = new URL(decodeURIComponent(url.pathname.slice(PROXY_ENDPOINT.length).replace(/^\/+/, "")));
    } catch (error) {
      break; // Exit if we can't parse further
    }
  }

  // Only allow requests if the hostname matches or is on the whitelist
  if (!WHITELIST.some((regex) => regex.test(url.hostname)) && url.hostname !== host) {
    res.statusCode = 403;
    res.end(
      `Forbidden: Only the following domain patterns are allowed: ${WHITELIST.map(
        (r) => r.source
      ).join(", ")}`
    );
    return;
  }
  
  try {
    // Remove problematic headers before sending the request
    const badRequestHeaders = ["host", "connection", "content-length"];
    const cleanHeaders = { ...headers };
    badRequestHeaders.forEach((h) => delete cleanHeaders[h]);
    
    const response = await fetch(url.toString(), { 
      method, 
      headers: cleanHeaders, 
      body,
      redirect: 'follow'
    });
    
    // Always preserve the Content-Type header
    res.setHeader("Content-Type", response.headers.get("content-type") || "");

    // Filter out headers that may interfere with our proxy
    const badResponseHeaders = ["content-encoding", "content-length", "content-security-policy", "x-frame-options"];
    response.headers.forEach((value, key) => {
      if (!badResponseHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    
    res.statusCode = response.status;
    const contentType = response.headers.get("content-type") || "";
    
    if (contentType.match(/text|json|javascript|html/)) {
      let text = await response.text();
      text = rewriteResponse(text, url, host, contentType);
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
    console.error("Proxy error:", error);
    res.statusCode = 500;
    res.end(`Proxy error: ${error.message}`);
  }
}

/**
 * rewriteResponse - Applies all the response rewriting:
 *  1. Injects a <base> tag (if not already present) so that relative URLs resolve via the proxy.
 *  2. Rewrites absolute URLs to point to the proxy.
 *  3. Injects a client-side rewriting script to catch dynamically added elements.
 *
 * @param {string} content - The original content.
 * @param {URL} url - The original URL of the response.
 * @param {string} host - The proxy host.
 * @returns {string} - The rewritten HTML.
 */
export function rewriteResponse(content, url, host, contentType) {
  content = content.replace(/(https?:\/\/)([^\/\s"']+)/gi, (match, protocol, hostname) => {
    if (hostname === host) return match;
    return `${protocol}${host}${PROXY_ENDPOINT}/${encodeURIComponent(match)}`;
  });

  if (contentType?.includes("html")) {
    if (!/<base\s/i.test(content)) {
      const baseHref = `${PROXY_ENDPOINT}/${encodeURIComponent(url.origin + url.pathname)}`;
      content = content.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
    }
    return injectRewriteScript(content, url);
  }

  return content;
}

/**
 * injectRewriteScript - Uses jsdom to insert a script into the HTML that intercepts
 * any dynamic setting of src/href attributes (e.g. via setAttribute or property assignment)
 * and rewrites them to pass through the proxy.
 *
 * @param {string} html - The HTML content.
 * @returns {string} - The HTML with the injection script.
 */
function injectRewriteScript(html, url) {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const script = document.createElement("script");
  script.textContent = `
    (function() {
      const origin = new URL(\`${url}\`)?.origin
      const proxyUrl = '/api/proxy/';
      const isProxied = url => url.includes(proxyUrl);
      const rewriteUrl = url => {
        if (typeof url === 'string') {
          if (url[0] === '/') {
            url = url.slice(1);
          }
          if (!isProxied(url)) {
            url = proxyUrl + encodeURIComponent(origin + '/' + url);
          }
        }
        return url;
      };
      const originalSetAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function(name, value) {
        if (['src', 'href'].includes(name.toLowerCase()) && typeof value === 'string') {
          value = rewriteUrl(value);
        }
        return originalSetAttribute.call(this, name, value);
      };
      const overrideSrcProperty = (prototype) => {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'src');
        if (descriptor && descriptor.set) {
          Object.defineProperty(prototype, 'src', {
            set: function(value) {
              const newValue = rewriteUrl(value);
              descriptor.set.call(this, newValue);
            },
            get: descriptor.get,
            configurable: true,
            enumerable: true
          });
        }
      };

      overrideSrcProperty(HTMLScriptElement.prototype);
      overrideSrcProperty(HTMLImageElement.prototype);
      overrideSrcProperty(HTMLIFrameElement.prototype);

      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          if (mutation.type === 'attributes' && ['src', 'href'].includes(mutation.attributeName)) {
            const el = mutation.target;
            const originalValue = el.getAttribute(mutation.attributeName);
            if (originalValue && !isProxied(originalValue)) {
              el.setAttribute(mutation.attributeName, rewriteUrl(originalValue));
            }
          }
        });
      });
      observer.observe(document.documentElement, {
        attributes: true,
        subtree: true,
        attributeFilter: ['src', 'href']
      });
    })();
  `;
  // Insert the script as the first child of the document.
  document.documentElement.insertBefore(script, document.documentElement.firstChild);
  return dom.serialize();
}
