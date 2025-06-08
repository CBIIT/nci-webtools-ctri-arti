import AuthorizedImport from "./auth.js";
import Home from "./home.js";
const Chat = AuthorizedImport({ path: "./agents/chat.js" });
const FedPulse = AuthorizedImport({ path: "./agents/fedpulse.js" });
const ConsentCrafter = AuthorizedImport({ path: "./tools/consent-crafter.js" });
const LayPersonAbstract = AuthorizedImport({ path: "./tools/lay-person-abstract.js" });
const Translate = AuthorizedImport({ path: "./tools/translate.js" });
const SemanticSearch = AuthorizedImport({ path: "./tools/semantic-search.js" });
const Users = AuthorizedImport({ path: "./users/index.js", roles: [1] });
const UserEdit = AuthorizedImport({ path: "./users/edit.js", roles: [1] });
const UserUsage = AuthorizedImport({ path: "./users/usage.js", roles: [1] });

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
      },
    ],
  },
  {
    path: "/admin",
    // component: Home,
    title: "Admin",
    children: [
      {
        path: "users",
        title: "Users",
        component: Users,
      },
      {
        path: "users/:id",
        title: "User",
        component: UserEdit,
        hidden: true,
      },
      {
        path: "usage",
        title: "Usage",
        component: Users,
      },
      {
        path: "users/:id/usage",
        title: "User Usage",
        component: UserUsage,
        hidden: true,
      },
    ],
  }
];

export default routes;
