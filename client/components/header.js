import html from "solid-js/html";

import Logo from "../assets/images/logo.js";

export default function Header() {
  function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const q = `${form.q.value} site:${window.location.hostname}`;
    const url = form.action + "?" + new URLSearchParams({ q });
    open(url, form.target);
  }
  return html`
    <header class="flex-grow-0">
      <div class="bg-light">
        <div class="container">
          <div class="row">
            <div class="col d-flex align-items-center py-1">
              <img src="assets/images/icon-flag.svg" alt="U.S. Flag" width="16" class="me-1" />
              <small>An official website of the United States government</small>
            </div>
          </div>
        </div>
      </div>
      <div
        class="container d-none d-lg-flex flex-wrap justify-content-between align-items-center py-3"
      >
        <a href="/" title="Home" class="d-inline-block">
          <${Logo} alt="Logo" class="pe-none" />
        </a>
        <form
          class="input-group w-auto"
          action="https://www.google.com/search"
          target="_blank"
          onSubmit=${handleSubmit}
        >
          <input name="q" class="form-control" aria-label="Search" />
          <button class="btn btn-primary">Search</button>
        </form>
      </div>
    </header>
  `;
}
