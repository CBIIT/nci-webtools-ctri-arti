import html from "solid-js/html";


import Header from "../components/header.js";
import Footer from "../components/footer.js";
import Nav from "../components/nav.js";
import routes from "./routes.js";

export default function Layout({ children }) {
  return html`
    <div class="shadow mb-4">
      <${Header} /> 
      <${Nav} routes=${routes} />
    </div>
    <main class="d-flex flex-column flex-grow-1">${children}</main>
    <${Footer} />
  `;
}