import html from "solid-js/html";
import { A } from "@solidjs/router";
import { createSignal, createResource, For, Show } from "solid-js";

export default function Nav(props) {
  const [session] = createResource(() => fetch("/api/session").then((res) => res.json()));
  const [visible, setVisible] = createSignal({});
  const toggleVisible = (key) => setVisible((prev) => ({ [key]: !prev[key] }));
  return html`
    <nav class="navbar navbar-expand-lg font-title">
      <div class="container">
        <a href="/" class="navbar-brand d-inline-block d-lg-none" class="mw-60 ">
          <object height="50" data="assets/images/logo.svg" alt="Logo" class="pe-none py-1" />
        </a>
        <button
          class="navbar-toggler border-0"
          type="button"
          onClick=${() => toggleVisible("main")}
          aria-controls="navbar"
          aria-expanded=${() => visible().main}
          aria-label="Toggle navigation">
          =
        </button>
        <div id="navbar" class="collapse navbar-collapse" classList=${() => ({ show: visible().main })}>
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
                    onClick=${(ev) => (route.children ? (ev.preventDefault(), toggleVisible(route.path)) : setVisible({}))}>
                    ${route.title}
                  <//>
                  <${Show} when=${route.children}>
                    <ul class="dropdown-menu border-0" classList=${() => ({ show: visible()[route.path] })}>
                      <${For} each=${route.children?.filter((c) => !c.hidden)}>
                        ${(child) => html`
                          <li>
                            <${A}
                              href=${child.rawPath || [route.path, child.path].join("/")}
                              activeClass="active"
                              target=${child.rawPath && "_self" }
                              class="dropdown-item nav-link text-decoration-none"
                              onClick=${() => setVisible({})}>
                              ${child.title}
                            <//>
                          </li>
                        `}
                      <//>
                    </ul>
                  <//>
                </li>
              `}
            <//>
          </ul>
        </div>
      </div>
    </nav>
  `;
}
