import html from "solid-js/html";
import { A } from "@solidjs/router";
import { createSignal, createResource, For, Show } from "solid-js";

export default function Nav({ routes }) {
  const [session] = createResource(() => fetch("/api/session").then((res) => res.json()));
  const [visible, setVisible] = createSignal({});
  const toggleVisible = (key) => setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
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
          <ul class="navbar-nav me-auto">
            <${For} each=${() => routes.filter((route) => !route.hidden)}>
              ${(route) => html`
                <li class="nav-item" classList=${{ dropdown: route.children }}>
                  <${A}
                    href=${route.path}
                    end=${true}
                    activeClass="active"
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
              fallback=${html`<a href="/api/login" target="_self" class="nav-link text-decoration-none">Login</a>`}>
              <li class="nav-item dropdown login" classList=${() => ({ "bg-info": visible().user })}>
                <button class="nav-link dropdown-toggle" onClick=${() => toggleVisible("user")} classList=${() => ({ "text-light": visible().user })}>
                  ${() => session()?.user?.firstName || "User"}
                </button>
                <div class="dropdown-menu border-0 rounded-0 bg-info p-4" classList=${() => ({ show: visible().user })}>
                  <div class="container">
                    <div class="d-flex flex-row gap-4 px-2">
                      <${For} each=${() => routes.filter((r) => r.loginNavbar && r.loginNavbarTitle && r.allowedRoles?.includes(session()?.user?.roleId))}>

                        ${(route) => html`
                          <div class="">
                            <${A}
                              href=${route.path}
                              class="dropdown-item nav-link text-decoration-none text-light"
                              onClick=${() => setVisible({})}>
                              ${route.loginNavbarTitle || route.title}
                            <//>
                          </div>
                        `}
                      <//>
                      <div class="">
                        <${A}
                          href=${() => `/user/profile/${session()?.user?.id}`}
                          class="dropdown-item nav-link text-decoration-none text-light"
                          onClick=${() => setVisible({})}>
                          User Profile
                        <//>
                      </div>
                      <div class="">
                        <a href="/api/logout" target="_self" class="dropdown-item nav-link text-decoration-none text-light">Logout</a>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            <//>
          </div>
        </div>
      </div>
    </nav>
  `;
}
