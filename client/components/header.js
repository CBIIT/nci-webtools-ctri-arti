import html from "solid-js/html";
import { createSignal } from "solid-js";

export default function Header() {
  const [hidden, setHidden] = createSignal(true);
  const toggleHidden = () => setHidden(!hidden());

  return html`
    <header class="flex-grow-0">
      <div class="bg-light">
        <div class="container">
          <div class="row">
            <div class="col small">
              <span class="me-1">
                <img src="assets/images/icon-flag.svg" alt="U.S. Flag" width="16" class="me-1" />
                An official website of the United States government
              </span>
              <button type="button" onClick=${toggleHidden} class="p-0 bg-transparent border-0 link-secondary fw-normal" href="#">
                <span class="text-decoration-underline me-2">Here’s how you know</span>
                <img
                  style=${() => (hidden() ? "transform: rotate(90deg)" : "transform: rotate(-90deg)")}
                  src="assets/images/icon-chevron.svg"
                  alt="chevron icon" />
              </button>
            </div>
          </div>

          <div class="row" hidden=${hidden}>
            <div class="col-md-6 py-4 d-flex">
              <img src="assets/images/icon-dot-gov.svg" alt="dot-gov" height="40" class="me-2" />
              <div>
                <strong>Official websites use .gov</strong>
                <div>A <strong>.gov</strong> website belongs to an official government organization in the United States.</div>
              </div>
            </div>

            <div class="col-md-6 py-4 d-flex">
              <img src="assets/images/icon-https.svg" alt="https" height="40" class="me-2" />
              <div>
                <strong>Secure .gov websites use HTTPS</strong>
                <div>
                  A <strong>lock</strong> (
                  <svg xmlns="http://www.w3.org/2000/svg" width="9" height="12" viewBox="0 5 52 64" role="img">
                    <path
                      fill="steelblue"
                      fill-rule="evenodd"
                      d="M26 0c10.493 0 19 8.507 19 19v9h3a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V32a4 4 0 0 1 4-4h3v-9C7 8.507 15.507 0 26 0zm0 8c-5.979 0-10.843 4.77-10.996 10.712L15 19v9h22v-9c0-6.075-4.925-11-11-11z"></path>
                  </svg>
                  ) or <strong>https://</strong> means you’ve safely connected to the .gov website. Share sensitive information only on
                  official, secure websites.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="d-none d-lg-block">
        <div class="container pt-3">
          <a href="/" title="Home" class="d-inline-block">
            <object height="50" data="assets/images/logo.svg" alt="Logo" class="pe-none d-none d-lg-inline-block" />
          </a>
        </div>
      </div>
    </header>
  `;
}
