import { Router } from "@solidjs/router";
import html from "solid-js/html";
import { render } from "solid-js/web";


import { AuthProvider } from "../contexts/auth-context.js";

import Layout from "./layout.js";
import getRoutes from "./routes.js";

render(
  () => html` <${AuthProvider}> ${() => html`<${Router} root=${Layout}>${getRoutes()}<//>`} <//> `,
  window.app
);

const { search, hostname } = window.location;
const params = new URLSearchParams(search);
if (params.has("test") && hostname === "localhost") {
  try {
    await import("../test/run.js");
  } finally {
    window.TESTS_DONE = true;
  }
}
