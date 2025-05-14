import html from "solid-js/html";
import { A } from "@solidjs/router";
import { createSignal, createResource, For, Show } from "solid-js";

export default function Nav({ routes }) {
  const [session] = createResource(() => fetch("/api/session").then((res) => res.json()));
  const [visible, setVisible] = createSignal({});
  const toggleVisible = (key) => setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  return html`
    <nav class="navbar navbar-expand-lg font-title" style="box-shadow: 0px 4px 4px rgba(0, 0, 0, 0.25); padding-bottom: 13px;">
      <div class="container outerPadding">
        <a href="/" class="navbar-brand d-inline-block d-lg-none" class="mw-60 ">
          <object height="50" data="assets/images/logo.svg" alt="Logo" class="pe-none py-1" />
        </a>
        <button
          class="navbar-toggler border-0"
          type="button"
          onClick=${() => toggleVisible("main")}
          aria-controls="navbarNavDropdown"
          aria-expanded=${() => visible().main}
          aria-label="Toggle navigation">
          =
        </button>
        <div class=${() => ["collapse navbar-collapse", visible().main ? "show" : ""].join(" ")} id="navbarNavDropdown">
          <ul class="navbar-nav me-auto">
            <${For} each=${() => routes.filter((route) => !route.hidden)}
              >${(route) => html`
                <li class="nav-item" classList=${{ dropdown: route.children }}>
                  <${A}
                    href=${route.path}
                    end=${true}
                    activeClass="active"
                    class="nav-link text-decoration-none"
                    classList=${{ "dropdown-toggle": route.children }}
                    onClick=${(ev) => (route.children ? (ev.preventDefault(), toggleVisible(route.path)) : setVisible({}))}
                    style="padding: 8px 0px 0px 0px; margin-right: 20px; font-family: Poppins; font-weight: 600; font-size: 16.64px; color: #585c65;"
                  >
                    ${route.title}
                  <//>
                  <${Show} when=${route.children}>
                    <ul class=${() => ["dropdown-menu border-0", visible()[route.path] ? "show" : ""].join(" ")}>
                      <${For} each=${route.children?.filter((c) => !c.hidden)}>
                        ${(child) => html`
                          <li>
                            <${A}
                              href=${[route.path, child.path].join("/")}
                              activeClass="active"
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
          <div class="navbar-nav">
            <${Show}
              when=${() => session()?.user}
              fallback=${html`
                <a 
                  href="/api/login" 
                  target="_self" 
                  class="nav-link 
                  text-decoration-none"
                  style="
                    padding: 0px; 
                    margin-right: 30px; 
                    color: #007bbd;
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                    font-family: Poppins; 
                    font-weight: 600; 
                    font-size: 14px;"
                  >
                    Login
                </a>
                `}>
              <li class="nav-item dropdown">
                <a class="nav-link dropdown-toggle" onClick=${() => toggleVisible("user")} href="#" role="button">
                  ${() => session()?.user?.firstName || "User"}
                </a>
                <ul class=${() => ["dropdown-menu bg-transparent text-end end-0 border-0", visible().user ? "show" : ""].join(" ")}>
                  <a href="/api/logout" target="_self" class="nav-link text-decoration-none">Logout</a>
                </ul>
              </li>
            <//>
          </div>
        </div>
      </div>
    </nav>
  `;
}
