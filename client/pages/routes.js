import html from "solid-js/html";

import AuthorizedImport from "./auth.js";
import Home from "./home.js";

function createProtectedRoute({ importPath, ...route }) {
  return {
    ...route,
    component: AuthorizedImport({
      path: importPath,
      policy: route.policy,
    }),
  };
}

const TOOLS_CHILDREN = [
  {
    path: "chat",
    title: "Chat",
    policy: "/tools/chat",
    importPath: "./tools/chat/index.js",
  },
  {
    path: "chat-v2",
    title: html`<span>Chat<sup class="text-warning">v2</sup></span>`,
    policy: "/tools/chat-v2",
    importPath: "./tools/chat-v2/index.js",
  },
  {
    path: "consent-crafter",
    title: "ConsentCrafter",
    policy: "/tools/consent-crafter",
    importPath: "./tools/consent-crafter/index.js",
  },
  {
    path: "translator",
    title: "Translator",
    policy: "/tools/translator",
    importPath: "./tools/translate/index.js",
  },
  {
    path: "semantic-search",
    title: "Semantic Search",
    policy: "/tools/semantic-search",
    importPath: "./tools/semantic-search.js",
    hidden: true,
  },
  {
    path: "export-conversations",
    title: "Export Conversations",
    policy: "/tools/export-conversations",
    importPath: "./tools/export-conversations/index.js",
    hidden: true,
  },
  {
    path: "protocol-advisor",
    title: "Protocol Advisor",
    policy: "/tools/protocol-advisor",
    importPath: "./tools/protocol-advisor/index.js",
  },
].map(createProtectedRoute);

const USER_CHILDREN = [
  {
    path: "profile",
    title: "My Profile",
    policy: "/_/profile",
    importPath: "./users/profile.js",
  },
  {
    path: "users",
    title: "Manage Users",
    policy: "/_/users",
    importPath: "./users/index.js",
  },
  {
    path: "users/:id",
    title: "Edit User",
    policy: "/_/users",
    importPath: "./users/edit.js",
    hidden: true,
  },
  {
    path: "usage",
    title: "AI Usage Dashboard",
    policy: "/_/usage",
    importPath: "./users/usage/usage.js",
  },
  {
    path: "users/:id/usage",
    title: "User Usage",
    policy: "/_/usage",
    importPath: "./users/usage-statistic/user-usage-page.js",
    hidden: true,
  },
  {
    rawPath: "/api/v1/logout",
    title: "Logout",
  },
].map((route) => ({
  ...(route.importPath ? createProtectedRoute(route) : route),
  navRequiresAuth: true,
}));

const ROUTES = [
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
    children: TOOLS_CHILDREN,
  },
  {
    path: "/_",
    title: "User",
    class: "ms-lg-auto",
    children: USER_CHILDREN,
  },
];

/**
 * Generate site routes.
 *
 * @returns {Array} - Array of route configurations
 */
export default function getRoutes() {
  return ROUTES;
}
