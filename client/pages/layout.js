import html from "solid-js/html";


import Header from "../components/header.js";
import PrivacyNotice from "../components/privacy-notice.js";
import Footer from "../components/footer.js";
import Nav from "../components/nav.js";
import routes from "./routes.js";

export default function Layout({ children }) {
  return html`
    <div class="shadow">
      <${Header} /> 
      <${Nav} routes=${routes} />
    </div>
    <${PrivacyNotice}/>
    <main class="d-flex flex-column flex-grow-1">${children}</main>
    <${Footer} />
  `;
}