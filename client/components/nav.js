import html from "solid-js/html";
import { A } from "@solidjs/router";
import { createSignal, createResource } from "solid-js";

export default function Nav({ routes }) {
  const [session] = createResource(() => fetch("/api/session").then((res) => res.json()));
  const [expanded, setExpanded] = createSignal(false);
  const [menuOpen, setMenuOpen] = createSignal({});
  const toggleExpanded = () => setExpanded((e) => !e);
  const toggleMenu = (menu, item) => {
    setMenuOpen((prev) => ({ ...prev, [menu]: prev[menu] === item ? null : item }));
  };
  return html`
    <nav class="navbar navbar-expand-lg font-title">
      <div class="container">
        <a href="/" class="navbar-brand d-inline-block d-lg-none" class="mw-60 ">
          <object height="50" data="assets/images/logo.svg" alt="Logo" class="pe-none py-1" />
        </a>
        <button
          class="navbar-toggler border-0"
          type="button"
          onClick=${toggleExpanded}
          aria-controls="navbarNavDropdown"
          aria-expanded=${expanded}
          aria-label="Toggle navigation">
          ${() => expanded()
            ? html`<svg xmlns="http://www.w3.org/2000/svg" class="opacity-75" height="20" viewBox="0 0 576 512"><path d="M408 64l112 0c8.8 0 16 7.2 16 16s-7.2 16-16 16L408 96c-8.8 0-16-7.2-16-16s7.2-16 16-16zM266.2 132.7c6.9-3.1 14.3-4.7 21.8-4.7s15 1.6 21.8 4.7l217.4 97.5c10.2 4.6 16.8 14.7 16.8 25.9s-6.6 21.3-16.8 25.9L309.8 379.3c-6.9 3.1-14.3 4.7-21.8 4.7s-15-1.6-21.8-4.7L48.8 281.9C38.6 277.3 32 267.2 32 256s6.6-21.3 16.8-25.9l217.4-97.5zM288 160c-3 0-6 .6-8.8 1.9L69.3 256l210 94.1c2.8 1.2 5.7 1.9 8.8 1.9s6-.6 8.8-1.9l210-94.1-210-94.1c-2.8-1.2-5.7-1.9-8.8-1.9zM48.8 358.1l45.9-20.6 39.1 17.5L69.3 384l210 94.1c2.8 1.2 5.7 1.9 8.8 1.9s6-.6 8.8-1.9l210-94.1-64.5-28.9 39.1-17.5 45.9 20.6c10.2 4.6 16.8 14.7 16.8 25.9s-6.6 21.3-16.8 25.9L309.8 507.3c-6.9 3.1-14.3 4.7-21.8 4.7s-15-1.6-21.8-4.7L48.8 409.9C38.6 405.3 32 395.2 32 384s6.6-21.3 16.8-25.9z"/></svg>`
            : html`<svg xmlns="http://www.w3.org/2000/svg" class="opacity-75" height="20" viewBox="0 0 576 512"><path d="M266.2 4.7C273 1.6 280.5 0 288 0s15 1.6 21.8 4.7l217.4 97.5c10.2 4.6 16.8 14.7 16.8 25.9s-6.6 21.3-16.8 25.9L309.8 251.3c-6.9 3.1-14.3 4.7-21.8 4.7s-15-1.6-21.8-4.7L48.8 153.9C38.6 149.3 32 139.2 32 128s6.6-21.3 16.8-25.9L266.2 4.7zM288 32c-3 0-6 .6-8.8 1.9L69.3 128l210 94.1c2.8 1.2 5.7 1.9 8.8 1.9s6-.6 8.8-1.9l210-94.1-210-94.1C294 32.6 291 32 288 32zM48.8 358.1l45.9-20.6 39.1 17.5L69.3 384l210 94.1c2.8 1.2 5.7 1.9 8.8 1.9s6-.6 8.8-1.9l210-94.1-64.5-28.9 39.1-17.5 45.9 20.6c10.2 4.6 16.8 14.7 16.8 25.9s-6.6 21.3-16.8 25.9L309.8 507.3c-6.9 3.1-14.3 4.7-21.8 4.7s-15-1.6-21.8-4.7L48.8 409.9C38.6 405.3 32 395.2 32 384s6.6-21.3 16.8-25.9zM94.7 209.5l39.1 17.5L69.3 256l210 94.1c2.8 1.2 5.7 1.9 8.8 1.9s6-.6 8.8-1.9l210-94.1-64.5-28.9 39.1-17.5 45.9 20.6c10.2 4.6 16.8 14.7 16.8 25.9s-6.6 21.3-16.8 25.9L309.8 379.3c-6.9 3.1-14.3 4.7-21.8 4.7s-15-1.6-21.8-4.7L48.8 281.9C38.6 277.3 32 267.2 32 256s6.6-21.3 16.8-25.9l45.9-20.6z"/></svg>`
          }
        </button>
        <div class=${() => ["collapse navbar-collapse", expanded() ? "show" : ""].join(" ")} id="navbarNavDropdown">
          <ul class="navbar-nav me-auto">
            ${routes
              .filter((route) => !route.hidden)
              .map(
                (route) => html`
                  <li class=${["nav-item", route.children ? "dropdown" : ""].join(" ")}>
                    <${A}
                      href=${route.path}
                      end=${true}
                      activeClass="active"
                      class="nav-link text-decoration-none"
                      onClick=${(ev) =>
                        route.children
                          ? (ev.preventDefault(), toggleMenu(route.path, route.title))
                          : (setMenuOpen({}), setExpanded(false))}>
                      ${route.title}
                      ${route.children &&
                      html`<img
                        class="ms-2"
                        style=${() => (menuOpen()[route.path] === route.title ? "transform: rotate(-90deg)" : "transform: rotate(90deg)")}
                        src="assets/images/icon-chevron.svg"
                        alt="chevron icon" />`}
                    </>
                    <ul
                      class=${() => ["dropdown-menu border-0", menuOpen()[route.path] === route.title ? "show" : ""].join(" ")}
                      hidden=${!route.children}>
                      ${route.children?.filter((route) => !route.hidden).map(
                        (child) => html`<li>
                          <${A}
                            href=${[route.path, child.path].join("/")}
                            activeClass="active"
                            class="dropdown-item nav-link text-decoration-none"
                            onClick=${() => (setExpanded(false), setMenuOpen({}))}>
                            ${child.title}
                          </>
                        </li>`
                      )}
                    </ul>
                  </li>
                `
              )}
          </ul>
          <div class="navbar-nav">
            ${() => session()?.authenticated 
                ? html`<a href="/api/logout" target="_self" class="nav-link text-decoration-none">Logout</a>`
                : html`<a href="/api/login" target="_self" class="nav-link text-decoration-none">Login</a>`}
          </div>
        </div>
      </div>
    </nav>
  `;
}
