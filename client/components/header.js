import html from "solid-js/html";
import { createSignal } from "solid-js";

export default function Header() {
  const [hidden, setHidden] = createSignal(true);
  const toggleHidden = () => setHidden(!hidden());

  return html`
    <header class="flex-grow-0">
      <div class="bg-flag-banner">
        <div class="container outerPadding" style="height: 46px">
          <div class="row h-100 align-items-center">
            <div class="col small">
              <img src="assets/images/icon-flag.svg" alt="U.S. Flag" width="16" class="align-middle" />
              <span 
                class="align-middle" 
                style="
                  font-family: Open Sans;
                  font-weight: 400;
                  font-size: 12px;
                  padding-left: 14px"
              >
                An official website of the United States government
              </span>
            </div>
          </div>
        </div>
      </div>
      <div style="padding-top: 35px; padding-bottom: 12px">
        <div class="container outerPadding d-flex justify-content-between align-items-center flex-wrap">
          <a href="/" title="Home" class="d-inline-block">
            <object height="50" data="assets/images/logo.svg" alt="Logo" class="pe-none d-none d-lg-inline-block" />
          </a>
          <div class="input-group mt-3 mt-lg-0" style="max-width: 335px; max-height: 35px;">
            <input 
              type="text" 
              class="form-control" 
              placeholder="" 
              aria-label="Search" 
              style="
                max-width: 254px;
                border: 1px solid #71767A; 
                border-right: none; 
                border-radius: 0px;"
            />
            <button 
              class="btn" 
              type="button"
              style="
                max-width: 82px;
                background-color: #3a75bd;
                color: #ffffff;
                font-family: Open Sans;
                font-weight: 600;
                font-size: 16px;
                border-top-right-radius: 5px;
                border-bottom-right-radius: 5px;"
            >
              Search
            </button>
          </div>
        </div>
      </div>
    </header>
  `;
}
