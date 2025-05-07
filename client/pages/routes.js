import { lazy } from "solid-js";

import Home from "./home.js";
const Tools = () => import("./tools/index.js");
const Agents = () => import("./agents/index.js");
const Chat = () => import("./agents/chat.js");
const Chat2 = () => import("./agents/chat2.js");
const FedPulse = () => import("./agents/fedpulse.js");
const Translate = () => import("./tools/translate.js");
const ConsentCrafter = () => import("./tools/consent-crafter.js");
const Workspaces = () => import("./tools/workspaces/index.js");

const routes = [
  {
    path: "",
    title: "Home",
    component: Home,
    hidden: false,
  },
  {
    path: "/agents/policyai",
    title: "PolicyAI",
    component: lazy(FedPulse),
    hidden: true,
  },
  {
    path: "/agents/chat",
    title: "Chat",
    component: lazy(Chat),
    hidden: true,
  },
  {
    path: "/agents/fedpulse",
    title: "FedPulse",
    component: lazy(FedPulse),
  },
  {
    path: "/tools/consentcrafter",
    title: "ConsentCrafter",
    component: lazy(ConsentCrafter),
  },
  {
    path: "/tools",
    title: "Tools",
    children: [
      {
        path: "",
        title: "Tools",
        component: lazy(Tools),
        hidden: true,
      },
      {
        path: "chat",
        title: "Chat",
        component: lazy(Chat),
      },
      {
        path: "chat2",
        title: "Chat (New)",
        component: lazy(Chat2),
        hidden: true,
      },
      {
        path: "translate",
        title: "Translate",
        component: lazy(Translate),
      },
      {
        path: "workspaces",
        title: "Workspaces",
        component: lazy(Workspaces),
      }
    ]
  },

];

export default routes;