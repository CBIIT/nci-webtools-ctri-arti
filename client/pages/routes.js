import { lazy } from "solid-js";
import html from "solid-js/html";
import Home from "./home.js";
import ProtectedRoute from "./protected-routes.js";
const Tools = () => import("./tools/index.js");
const Agents = () => import("./agents/index.js");
const Chat = () => import("./agents/chat.js");
const Chat2 = () => import("./agents/chat2.js");
const FedPulse = () => import("./agents/fedpulse.js");
const Translate = () => import("./tools/translate.js");
const ConsentCrafter = () => import("./tools/consent-crafter.js");
const LayPersonAbstract = () => import("./tools/lay-person-abstract.js");
const Workspaces = () => import("./tools/workspaces/index.js");
const Users = () => import("./users/index.js");
const UserEdit = () => import("./users/edit.js");
const UserUsage = () => import("./users/usage.js");

const LazyFedPulse = lazy(FedPulse);
const LazyChat = lazy(Chat);
const LazyConsentCrafter = lazy(ConsentCrafter);
const LazyLayPersonAbstract = lazy(LayPersonAbstract);

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
        path: "fedpulse",
        title: "FedPulse",
        component: () => html`
          <${ProtectedRoute}>
            <${LazyFedPulse} />
          <//>
        `,
      },
      {
        path: "chat",
        title: "Chat",
        component: () => html`
          <${ProtectedRoute}>
            <${LazyChat} />
          <//>
        `,
      },
      {
        path: "consentcrafter",
        title: "ConsentCrafter",
        component: () => html`
          <${ProtectedRoute}>
            <${LazyConsentCrafter} />
          <//>
        `,
      },
      {
        path: "laypersonabstract",
        title: "Lay Person Abstract",
        component: () => html`
          <${ProtectedRoute}>
            <${LazyLayPersonAbstract} />
          <//>
        `,
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
        hidden: true,
      },
      {
        path: "workspaces",
        title: "Workspaces",
        component: lazy(Workspaces),
        hidden: true,
      }
    ]
  },
  {
    path: "/users",
    title: "Users",
    component: lazy(Users),
    hidden: true,
  },
  {
    path: "/user/:id",
    title: "User",
    component: lazy(UserEdit),
    hidden: true,
  },
  {
    path: "/user/:id/usage",
    title: "User Usage",
    component: lazy(UserUsage),
    hidden: true,
  }
];

export default routes;