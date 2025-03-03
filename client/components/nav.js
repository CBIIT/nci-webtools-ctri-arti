import html from "solid-js/html";
import { A } from "@solidjs/router";

export default function Nav({ routes }) {
  return html`<nav>
    <ul>
      ${routes.map(
        (route) => html`<li>
          <${A} href=${route.path} end=${!route.path || route.path === "/"} activeClass="active"> ${route.title} </>
        </li>`
      )}
    </ul>
  </nav>`;
}