import { onCleanup, createSignal } from "solid-js";
import { render } from "solid-js/web";
import html from "solid-js/html";

render(() => html`<${Page} />`, window.app);

export default function Page() {
  return html`
    <div class="text-center my-5">
      <h1 class="display-6">Welcome to CompliAI</h1>
      <p class="fw-light fs-5">To get started, send a message below.</p>
    </div>
    <form onSubmit=${handleSubmit} class="bg-light">
      <textarea
        class="form-control form-control-sm border-0 bg-transparent shadow-0"
        type="textarea"
        id="message"
        name="message"
        placeholder="Enter a message"
        rows="3"
        autofocus />
      <div class="d-flex justify-content-between">
        <input type="file" id="inputFile" name="inputFile" class="form-control form-control-sm w-auto bg-transparent border-transparent" />
        <div class="input-group w-auto align-items-center">
          <div class="form-check form-switch mb-0 form-control-sm">
            <input class="form-check-input cursor-pointer" type="checkbox" role="switch" id="researchMode" name="researchMode" checked />
            <label class="form-check-label cursor-pointer" for="researchMode"
              ><span class="visually-hidden">Search</span><i class="bi bi-search"></i
            ></label>
          </div>
          <select class="form-select form-select-sm border-0 bg-transparent cursor-pointer" name="model" id="model">
            <optgroup label="Anthropic">
              <option value="anthropic.claude-3-opus-20240229-v1:0">Claude Opus</option>
              <option value="anthropic.claude-3-5-sonnet-20240620-v1:0" selected>Claude Sonnet</option>
              <option value="anthropic.claude-3-5-haiku-20241022-v1:0">Claude Haiku</option>
            </optgroup>
            <optgroup label="Amazon">
              <option value="amazon.nova-pro-v1:0">Nova Pro</option>
              <option value="amazon.nova-lite-v1:0">Nova Lite</option>
              <option value="amazon.nova-micro-v1:0">Nova Micro</option>
            </optgroup>
          </select>
          <button class="btn btn-secondary btn-sm" type="submit" style="border-radius: 0 0 var(--bs-border-radius-sm) 0">Send</button>
        </div>
      </div>
    </form>
  `;
}

function handleSubmit(event) {
  event.preventDefault();
  console.log("Form submitted");
  const form = event.target;
  console.log(form.message.value);
}

export function CountUp() {
  const [count, setCount] = createSignal(0);
  const decrement = () => setCount(count() - 1);
  const doubleCount = () => count() * 2;
  const interval = setInterval(() => setCount((count) => count + 1), 1000);
  onCleanup(() => clearInterval(interval));
  return html`<div>Count value is <button onClick=${decrement}>${count}</button> &times; 2 = ${doubleCount}</div>`;
}
