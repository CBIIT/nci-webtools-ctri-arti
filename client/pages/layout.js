import html from "solid-js/html";

import Footer from "../components/footer.js";
import Header from "../components/header.js";
import InactivityDialog from "../components/inactivity-dialog.js";
import Nav from "../components/nav.js";
import PrivacyNotice from "../components/privacy-notice.js";

import getRoutes from "./routes.js";

export default function Layout(props) {
  return html`
    <div class="shadow">
      <${Header} />
      <${Nav} routes=${getRoutes} />
    </div>
    <${PrivacyNotice} />
    <${InactivityDialog} />
    <main class="d-flex flex-column flex-grow-1 position-relative">${props.children}</main>
    <${Footer} />
  `;
}
