import { render } from "solid-js/web";
import { Router, HashRouter } from "@solidjs/router";
import html from "solid-js/html";

import Layout from "./layout.js";
import routes from "./routes.js";

render(() => html`<${HashRouter} root=${Layout}>${routes}</>`, window.app);
