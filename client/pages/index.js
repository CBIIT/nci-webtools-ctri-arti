import { render } from "solid-js/web";
import { Router } from "@solidjs/router";
import html from "solid-js/html";

import Layout from "./layout.js";
import routes from "./routes.js";

render(() => html`<${Router} root=${Layout}>${routes}<//>`, window.app);

const params = new URLSearchParams(window.location.search);
if (params.has("test")) {
  try {
    await import("../test/run.js");
  } finally {
    window.TESTS_DONE = true;
  }
}
