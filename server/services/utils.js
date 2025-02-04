import { JSDOM } from "jsdom";

export async function search(keywords, maxResults = 10) {
  const results = [];
  let formData = new URLSearchParams();
  formData.append("q", keywords);

  while (results.length < maxResults) {
    const response = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      body: formData,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Get results
    const elements = document.querySelectorAll("#links .web-result");
    const pageResults = [];
    
    for (const el of elements) {
      if (results.length >= maxResults) break;

      const titleEl = el.querySelector(".result__title");
      const snippetEl = el.querySelector(".result__snippet");
      const linkEl = el.querySelector(".result__url");

      if (titleEl && linkEl) {
        const ddgUrl = new URL(linkEl.href, "https://duckduckgo.com");
        const realUrl = ddgUrl.pathname === "/l/" ? 
          new URLSearchParams(ddgUrl.search).get("uddg") : linkEl.href;

        pageResults.push({
          title: titleEl?.textContent?.trim(),
          url: decodeURIComponent(realUrl),
          snippet: snippetEl?.textContent?.trim()
        });
      }
    }

    // Fetch all page contents in parallel
    const processedResults = await Promise.all(
      pageResults.map(async (result) => ({
        ...result,
        body: await extractTextFromUrl(result.url)
      }))
    );
    
    results.push(...processedResults);

    // Get next page data
    const form = document.querySelector("#links form");
    if (!form) break;

    formData = new URLSearchParams();
    form.querySelectorAll("input").forEach((input) => {
      formData.append(input.name, input.value);
    });

    if (!form || elements.length === 0) break;
  }

  return results;
}

async function extractTextFromUrl(url, expandUrls = false) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    ["script", "style", "nav", "header", "footer", "noscript"].forEach((tag) => {
      doc.querySelectorAll(tag).forEach((el) => el.remove());
    });

    if (expandUrls) {
      doc.querySelectorAll("a").forEach((el) => {
        el.textContent = `[${el.href}] ${el.textContent}`;
      });
    }

    return doc.body.textContent.replace(/\s+/g, " ").trim();
  } catch (error) {
    console.error(`Failed to extract text from ${url}:`, error);
    return "";
  }
}