import { For, Show, createSignal, createResource } from "solid-js";
import html from "solid-js/html";
import { useSubmitAiMessage } from "./hooks.js";
import DNASpinner from "/components/dna.js";

console.log("Chat2 page loaded");
export default function Page() {
  const { messages, loading, submitMessage } = useSubmitAiMessage();
  const [models] = createResource(() => fetch("/api/model/list").then((r) => r.json()));
  const [toggles, setToggles] = createSignal({});
  const toggle = (key) => () => setToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.target?.closest("form")?.requestSubmit();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const message = form.message.value;
    const inputFiles = form.inputFiles.files;
    const reasoningMode = form.reasoningMode.checked;
    const model = form.model.value;
    const system = "You use very few words. You use the think tool to think before responding.";
    const tools = {
      think:{
        description: "Think: Use the tool to think about something. It will not obtain new information or change the database, but just append the thought to the log. Use it when complex reasoning or some cache memory is needed.",
        parameters: {
          type: "object",
          properties: {
            thought: {
              type: "string",
              description: "A thought to think about.",
            },
          },
          required: ["thought"],
        },
      },
    };
    await submitMessage({ system, tools, message, inputFiles, reasoningMode, model });
    form.message.value = "";
    setTimeout(() => (form.inputFiles.value = ""), 100);
  }

  return html`
    <main class="container d-flex flex-column flex-grow-1 mb-3 position-relative">
      <div class="flex-grow-1 py-3">
        <div class="text-center my-5 font-serif" hidden=${() => messages().length > 0}>
          <h1 class="text-gradient fw-bold font-title mb-2">Welcome</h1>
          <div class="text-secondary fw-semibold">How can we help you today?</div>
        </div>
        <${For} each=${messages}>${(message) => html`<pre>${JSON.stringify(message, null, 2)}</pre>`}<//>
        <${Show} when=${loading}><${DNASpinner} style="display: block; height: 1.1rem; width: 100%; margin: 1rem 0; opacity: 0.5" /><//>
      </div>
      <div class="small text-end">
        <a href="/agents/chat" target="_blank">Start a new conversation</a>
      </div>
      <form onSubmit=${handleSubmit} class="bg-light shadow-sm rounded position-sticky bottom-0">
        <textarea
          class="form-control form-control-sm border-0 bg-transparent shadow-0"
          onKeyDown=${handleKeyDown}
          id="message"
          name="message"
          placeholder="Enter message (Shift + Enter for new line)"
          rows="3"
          autofocus
          required />

        <div class="d-flex justify-content-between">
          <input
            type="file"
            id="inputFiles"
            name="inputFiles"
            class="form-control form-control-sm w-auto bg-transparent border-transparent"
            accept="text/*,image/jpeg,image/png,image/gif,image/webp,.pdf,.doc,.docx,.xls,.xlsx"
            multiple />

          <div class="input-group w-auto align-items-center">
            <div class="form-check form-switch form form-check-reverse form-control-sm">
              <input class="form-check-input" type="checkbox" id="reasoningMode" name="reasoningMode" />
              <label
                class="form-check-label text-secondary"
                for="reasoningMode"
                title="Enable this mode for more thorough responses to complex problems. Please note this requires additional time and resources."
                >Extended Reasoning Mode</label
              >
            </div>
            <select class="form-select form-select-sm border-0 bg-transparent cursor-pointer" name="model" id="model" required>
              <${For} each=${models}>${(m) => html`<option value=${m.value}>${m.label}</option>`}<//>
            </select>
            <button class="btn btn-dark btn-sm ms-2" type="submit" style="border-radius: 0 0 var(--bs-border-radius-sm) 0">Send</button>
          </div>
        </div>
      </form>
      <small class="text-center text-muted py-1"
        ><span title="Your conversations are stored only on your personal device."
          >To maintain your privacy, we never retain your data on our systems.</span
        >
        Please double-check statements, as Research Optimizer can make mistakes.</small
      >
    </main>
  `;
}
