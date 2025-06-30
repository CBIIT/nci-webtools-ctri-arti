import html from "solid-js/html";
import { A } from "@solidjs/router";
import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { Portal } from "solid-js/web";

export default function Nav(props) {
  const [menuRef, setMenuRef] = createSignal(null);
  const [activeDropdown, setActiveDropdown] = createSignal(null);
  const toggleActiveDropdown = (key) => setActiveDropdown((prev) => (key !== prev ? key : null));
  const handleClickOutside = (event) => !menuRef()?.contains(event.target) && setActiveDropdown(null);
  onMount(() => document.addEventListener("click", handleClickOutside, true));
  onCleanup(() => document.removeEventListener("click", handleClickOutside, true));
  return html`
    <nav class="navbar navbar-expand-lg font-title">
      <div class="container">
        <a href="/" class="navbar-brand d-inline-block d-lg-none" class="mw-60 ">
          <object height="50" data="assets/images/logo.svg" alt="Logo" class="pe-none py-1" />
        </a>
        <button
          class="navbar-toggler border-0"
          type="button"
          onClick=${() => toggleActiveDropdown("main")}
          aria-controls="navbar"
          aria-expanded=${() => activeDropdown() === "main"}
          aria-label="Toggle navigation">
          =
        </button>
        <div id="navbar" class="collapse navbar-collapse" classList=${() => ({ show: activeDropdown() === "main" })}>
          <ul class="navbar-nav w-100">
            <${For} each=${() => props.routes.filter((route) => !route.hidden)}>
              ${(route) => html`
                <li class="nav-item" classList=${{ dropdown: route.children, [route.class]: true }}>
                  <${A}
                    href=${route.rawPath || route.path}
                    end=${true}
                    activeClass="active"
                    target=${() => route.rawPath && "_self"}
                    class="nav-link text-decoration-none"
                    classList=${{ "dropdown-toggle": route.children }}
                    onClick=${(ev) => (route.children ? (ev.preventDefault(), toggleActiveDropdown(route.path)) : setActiveDropdown(null))}>
                    ${route.title}
                  <//>
                  <${Show} when=${() => route.children}>
                    <${Portal} mount=${menuRef}>
                      <div class="container" hidden=${() => !(activeDropdown() === route.path)}>
                        <div class="row">
                          <${For} each=${route.children?.filter((c) => !c.hidden)}>
                            ${(child) => html`
                              <div class="col">
                                <${A}
                                  href=${child.rawPath || [route.path, child.path].join("/")}
                                  activeClass="active"
                                  end=${true}
                                  target=${child.rawPath && "_self" }
                                  class="fs-5 fw-semibold nav-link dropdown-link text-decoration-none me-3 my-3 d-inline-block"
                                  onClick=${() => setActiveDropdown(null)}>
                                  ${child.title}
                                <//>
                              </div>
                            `}
                          <//>
                        </div>
                      </div>
                      
                    <//>
                  <//>
                </li>
              `}
            <//>
          </ul>
        </div>
      </div>
    </nav>
    <nav ref=${e => setMenuRef(e)} class="bg-info text-light position-absolute w-100 z-3 shadow" />

  `;
}
