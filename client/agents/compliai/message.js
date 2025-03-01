import html from "solid-js/html";
import { parse as parseMarkdown } from "marked";
import yaml from "yaml";
import { parseStreamingJson } from "./utils.js";

export default function Message({ message, active }) {
  if (!message) return null;
  const isAssistant = message.role === "assistant" || message.toolUse;

  // Filter and join text content
  const textContent = message.content
    .filter((c) => c.text)
    .map((c) => c.text)
    .join("\n");

  // Filter tool use content and results
  const toolCalls = message.content
    .filter((c) => c.toolUse || c.toolResult)
    .map((c) => ({
      ...c.toolUse,
      result: c.toolResult?.content[0]?.json?.results,
    }));

  // Helper to check if input is just code
  const isCodeOnly = (input) => {
    const keys = Object.keys(input);
    return keys.length === 1 && keys[0] === "code";
  };

  // Helper to truncate long strings
  const truncate = (str, maxLength = 2000) => {
    if (!str || str.length <= maxLength) return str;
    return str.slice(0, maxLength) + "\n...";
  };

  // Helper to format tool result
  const formatResult = (result) => {
    if (result === null || result === undefined) return "No result";
    try {
      if (typeof result !== "string") result = JSON.stringify(result, null, 2);
      if (result?.results?.[0]?.url) {
        result = result.results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet }));
      }
      const json = parseStreamingJson(result);
      return truncate(yaml.stringify(json).split("\n").slice(0, 80).join("\n"));
    } catch (error) {
      console.error(error);
      return truncate(result.toString());
    }
  };

  return html`
    <div class="d-flex flex-wrap position-relative">
      ${textContent?.trim().length > 0 &&
      html`
        <span
          class=${["markdown card mb-2 p-2 small", isAssistant ? "bg-light w-100 border-secondary" : "bg-white"].join(" ")}
          innerHTML=${parseMarkdown(textContent)}></span>
        ${isAssistant &&
        window.MODELS_LOADED &&
        !active &&
        html`<button onClick=${() => playAudio(textContent)} class="position-absolute border-0 p-0 me-1 bg-transparent top-0 end-0">
          ▷
        </button>`}
      `}
      ${toolCalls.map(
        (tool) => html`
          ${tool.name &&
          tool.input &&
          html`
            <div class="card w-100 mb-2 border-secondary">
              <div class="card-header bg-secondary bg-opacity-10 py-1 px-2">
                <small class="text-secondary">Tool Call: ${tool.name}</small>
              </div>
              <div class="card-body p-2">
                ${isCodeOnly(tool.input)
                  ? html`<pre class="mb-0"><code>${tool.input.code}</code></pre>`
                  : html`<pre class="mb-0"><code>${formatResult(tool.input, null, 2)}</code></pre>`}
              </div>
            </div>
          `}
          ${tool.result &&
          html`
            <div class="card w-100 mb-2 border-success">
              <div class="card-header bg-success bg-opacity-10 py-1 px-2">
                <small class="text-success">Tool Result</small>
              </div>
              <div class="card-body p-2">
                <pre class="mb-0"><code>${formatResult(tool.result)}</code></pre>
              </div>
            </div>
          `}
        `
      )}
    </div>
  `;
}
