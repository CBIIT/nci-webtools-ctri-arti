import { lazy } from "solid-js";

import Home from "./home.js";
const About = () => import("./about.js");
const Projects = () => import("./projects/page.js");

const routes = [
  {
    path: "",
    title: "Home",
    component: Home,
  },
  {
    path: "/about",
    title: "About",
    component: lazy(About),
  },
  {
    path: "/projects",
    title: "Projects",
    component: lazy(Projects),
  },
];

export default routes;
