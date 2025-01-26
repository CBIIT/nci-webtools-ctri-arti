import html from "solid-js/html";

import Nav from "../components/nav.js";
import routes from "./routes.js";

export default function Layout({ children }) {
  return html`
    <${Nav} routes=${routes} />
    <main>${children}</main>
  `;
}
