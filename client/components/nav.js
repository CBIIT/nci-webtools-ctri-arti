import { A } from "@solidjs/router";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import html from "solid-js/html";
import { Portal } from "solid-js/web";

import { Status, useAuthContext } from "../contexts/auth-context.js";
import { canAccess } from "../utils/access.js";

export default function Nav(props) {
  const { access, status, user } = useAuthContext();
  const [menuRef, setMenuRef] = createSignal(null);
  const [activeDropdown, setActiveDropdown] = createSignal(null);
  const toggleActiveDropdown = (key) => setActiveDropdown((prev) => (key !== prev ? key : null));
  const handleClickOutside = (event) =>
    !menuRef()?.contains(event.target) && setActiveDropdown(null);
  onMount(() => document.addEventListener("click", handleClickOutside, true));
  onCleanup(() => document.removeEventListener("click", handleClickOutside, true));

  const routes = () => {
    return typeof props.routes === "function" ? props.routes() : props.routes || [];
  };
  const hasRouteAccess = (path, action = "view") =>
    status() === Status.LOADED && canAccess(access(), path, action);

  const isRouteVisible = (route) => {
    if (route.hidden) return false;
    if (route.navRequiresAuth && !user()) return false;
    if (route.policy && !hasRouteAccess(route.policy)) return false;
    if (route.children?.length) {
      if (route.path === "/_" && !user()) return true;
      return visibleChildren(route).length > 0;
    }
    return true;
  };

  const visibleChildren = (route) => route.children?.filter(isRouteVisible) || [];
  const routeHref = (route) => {
    console.log("🚀 ~ nav.js ~ routeHref ~ route:", route);
    if (route.path === "/_" && !user()) {
      return "/api/v1/login";
    }
    return route.rawPath || route.path;
  };
  const routeTarget = (route) =>
    route.rawPath || (route.path === "/_" && !user()) ? "_self" : undefined;
  const routeTitle = (route) => {
    if (route.path === "/_") {
      return user() ? user()?.firstName || "User" : "Login";
    }
    return route.title;
  };

  return html`
    <nav class="navbar navbar-expand-lg font-title z-3">
      <div class="container">
        <a href="/" class="navbar-brand d-inline-block d-lg-none" class="mw-60p " aria-label="Home">
          <object height="50" data="assets/images/logo.svg" alt="Logo" class="pe-none py-1" />
          <span class="visually-hidden">Home</span>
        </a>
        <button
          class="navbar-toggler border-0"
          type="button"
          onClick=${() => toggleActiveDropdown("main")}
          aria-controls="navbar"
          aria-expanded=${() => activeDropdown() === "main"}
          aria-label="Toggle navigation"
        >
          =
        </button>
        <div
          id="navbar"
          class="collapse navbar-collapse"
          classList=${() => ({ show: activeDropdown() === "main" })}
        >
          <ul class="navbar-nav w-100">
            <${For} each=${() => routes().filter(isRouteVisible)}>
              ${(route) => html`
                <li
                  class="nav-item"
                  classList=${() => ({
                    dropdown: visibleChildren(route).length > 0,
                    [route.class]: true,
                  })}
                >
                  <${A}
                    href=${() => routeHref(route)}
                    end=${() => visibleChildren(route).length === 0}
                    activeClass="active"
                    target=${() => routeTarget(route)}
                    class="nav-link text-decoration-none"
                    classList=${() => ({ "dropdown-toggle": visibleChildren(route).length > 0 })}
                    onClick=${(ev) =>
                      visibleChildren(route).length > 0
                        ? (ev.preventDefault(), toggleActiveDropdown(route.path))
                        : setActiveDropdown(null)}
                  >
                    ${() => routeTitle(route)}
                  <//>
                  <${Show} when=${() => visibleChildren(route).length > 0}>
                    <${Portal} mount=${menuRef}>
                      <div class="container" hidden=${() => !(activeDropdown() === route.path)}>
                        <div class="row">
                          <${For} each=${() => visibleChildren(route)}>
                            ${(child) => html`
                              <div class="col">
                                <${A}
                                  href=${child.rawPath || [route.path, child.path].join("/")}
                                  activeClass="active"
                                  end=${true}
                                  target=${child.rawPath && "_self"}
                                  class="fw-semibold nav-link dropdown-link text-decoration-none me-3 d-inline-block"
                                  onClick=${() => setActiveDropdown(null)}
                                >
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
    <nav
      ref=${(e) => setMenuRef(e)}
      class="bg-info text-light position-absolute w-100 z-3 shadow"
    />
  `;
}
