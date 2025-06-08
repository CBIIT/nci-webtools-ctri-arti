import { lazy } from "solid-js";
import html from "solid-js/html";
import Home from "./home.js";
import ProtectedRoute from "./protected-route.js";
const AsProtectedRoute = (path, props) => () => html`<${ProtectedRoute} ...${props}>${lazy(() => import(path))}<//>`;
const Chat = AsProtectedRoute("./agents/chat.js");
const FedPulse = AsProtectedRoute("./agents/fedpulse.js");
const ConsentCrafter = AsProtectedRoute("./tools/consent-crafter.js");
const LayPersonAbstract = AsProtectedRoute("./tools/lay-person-abstract.js");
const Translate = AsProtectedRoute("./tools/translate.js");
const SemanticSearch = AsProtectedRoute("./tools/semantic-search.js");
const Users = AsProtectedRoute("./users/index.js", { roles: [1] });
const UserEdit = AsProtectedRoute("./users/edit.js", { roles: [1] });
const UserUsage = AsProtectedRoute("./users/usage.js", { roles: [1] });

const routes = [
  {
    path: "",
    title: "Home",
    component: Home,
    hidden: false,
  },
  {
    path: "*",
    title: "Home",
    component: Home,
    hidden: true,
  },
  {
    path: "/tools",
    title: "Tools",
    children: [
      {
        path: "chat",
        title: "Chat",
        component: Chat,
      },
      {
        path: "fedpulse",
        title: "FedPulse",
        component: FedPulse,
      },
      {
        path: "consentcrafter",
        title: "ConsentCrafter",
        component: ConsentCrafter,
      },
      {
        path: "laypersonabstract",
        title: "Lay Person Abstract",
        component: LayPersonAbstract,
      },
      {
        path: "translate",
        title: "Translate",
        component: Translate,
        hidden: true,
      },
      {
        path: "semanticsearch",
        title: "Semantic Search",
        component: SemanticSearch,
        hidden: true,
      }        
    ]
  },
  {
    path: "/user",
    title: "Manage Users",
    component: Users,
    children: [
      {
        path: ":id",
        title: "User",
        component: UserEdit,
      },
      {
        path: ":id/usage",
        title: "User Usage",
        component: UserUsage,
      }
    ]
  },
];

export default routes;