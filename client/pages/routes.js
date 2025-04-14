import { lazy } from "solid-js";

import Home from "./home.js";
const Agents = () => import("./agents.js");
const Tools = () => import("./tools.js");

const routes = [
  {
    path: "",
    title: "Home",
    component: Home,
  },
  {
    path: "/tools",
    title: "Tools",
    component: lazy(Tools),
  },
  {
    path: "/agents",
    title: "Agents",
    title: lazy(Agents),
  }
];

export default routes;