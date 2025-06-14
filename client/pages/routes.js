import AuthorizedImport from "./auth.js";
import Home from "./home.js";
const Chat = AuthorizedImport({ path: "./tools/chat/index.js" });
const FedPulse = AuthorizedImport({ path: "./tools/chat/fedpulse.js" });
const ConsentCrafter = AuthorizedImport({ path: "./tools/consent-crafter.js" });
const LayPersonAbstract = AuthorizedImport({ path: "./tools/lay-person-abstract.js" });
const Translate = AuthorizedImport({ path: "./tools/translate.js" });
const SemanticSearch = AuthorizedImport({ path: "./tools/semantic-search.js" });
const Users = AuthorizedImport({ path: "./users/index.js", roles: [1] });
const UserEdit = AuthorizedImport({ path: "./users/edit.js", roles: [1] });
const Usage = AuthorizedImport({ path: "./users/usage.js", roles: [1] });
const UserUsage = AuthorizedImport({ path: "./users/user-usage.js", roles: [1] });

const { user } = await fetch("/api/session").then((res) => res.json());
const hasRole = (roleIds) => user && roleIds.includes(user?.Role?.id);

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
    path: "/_",
    rawPath: !user ? "/api/login" : undefined,
    title: user?.firstName || "Login",
    class: "ms-auto",
    children: user && [
      {
        rawPath: "_/users/" + user.id,
        title: "My Profile",
      },
      {
        path: "users",
        title: "Manage Users",
        component: Users,
        hidden: !hasRole([1]),
      },
      {
        path: "users/:id",
        title: "User Profile",
        component: UserEdit,
        hidden: true,
      },
      {
        path: "usage",
        title: "User Usage",
        component: Usage,
        hidden: !hasRole([1]),
      },
      {
        path: "users/:id/usage",
        title: "User Usage",
        component: UserUsage,
        hidden: true,
      },
      {
        rawPath: "/api/logout",
        title: "Logout",
      },
    ],
  },
];

export default routes;
