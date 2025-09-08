import html from "solid-js/html";
import { render } from "solid-js/web";

import { Router } from "@solidjs/router";

import Layout from "./layout.js";
import routes from "./routes.js";

render(() => html`<${Router} root=${Layout}>${routes}<//>`, window.app);

const { search, hostname } = window.location;
const params = new URLSearchParams(search);
if (params.has("test") && hostname === "localhost") {
  try {
    await import("../test/run.js");
  } finally {
    window.TESTS_DONE = true;
  }
}
