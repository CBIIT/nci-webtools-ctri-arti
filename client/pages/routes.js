import html from "solid-js/html";

import { useAuthContext } from "../contexts/auth-context.js";
import { canAccess } from "../utils/access.js";

import AuthorizedImport from "./auth.js";
import Home from "./home.js";

const Chat = AuthorizedImport({ path: "./tools/chat/index.js", policy: "/tools/chat" });
const ChatV2 = AuthorizedImport({ path: "./tools/chat-v2/index.js", policy: "/tools/chat-v2" });
const ConsentCrafter = AuthorizedImport({
  path: "./tools/consent-crafter/index.js",
  policy: "/tools/consent-crafter",
});
const Translate = AuthorizedImport({
  path: "./tools/translate/index.js",
  policy: "/tools/translator",
});
const SemanticSearch = AuthorizedImport({
  path: "./tools/semantic-search.js",
  policy: "/tools/semantic-search",
});
const ExportConversations = AuthorizedImport({
  path: "./tools/export-conversations/index.js",
  policy: "/tools/export-conversations",
});
const Users = AuthorizedImport({ path: "./users/index.js", policy: "/_/users" });
const UserEdit = AuthorizedImport({ path: "./users/edit.js", policy: "/_/users" });
const UserProfile = AuthorizedImport({ path: "./users/profile.js", policy: "/_/profile" });
const Usage = AuthorizedImport({ path: "./users/usage/usage.js", policy: "/_/usage" });
const UserUsage = AuthorizedImport({ path: "./users/user-usage.js", policy: "/_/usage" });

/**
 * Generate site routes.
 *
 * @returns {Array} - Array of route configurations
 */
export default function getRoutes() {
  const { user } = useAuthContext();
  const hasRouteAccess = (path, action = "view") => canAccess(user?.(), path, action);

  return [
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
          hidden: !hasRouteAccess("/tools/chat"),
        },
        {
          path: "chat-v2",
          title: html`<span>Chat<sup class="text-warning">v2</sup></span>`,
          component: ChatV2,
          hidden: !hasRouteAccess("/tools/chat-v2"),
        },
        {
          path: "consent-crafter",
          title: "ConsentCrafter",
          component: ConsentCrafter,
          hidden: !hasRouteAccess("/tools/consent-crafter"),
        },
        {
          path: "translator",
          title: "Translator",
          component: Translate,
          hidden: !hasRouteAccess("/tools/translator"),
        },
        {
          path: "semantic-search",
          title: "Semantic Search",
          component: SemanticSearch,
          hidden: true,
        },
        {
          path: "export-conversations",
          title: "Export Conversations",
          component: ExportConversations,
          hidden: true,
        },
      ],
    },
    {
      path: "/_",
      rawPath: !user?.() ? "/api/v1/login" : undefined,
      title: user?.() ? user?.().firstName || "User" : "Login",
      class: "ms-lg-auto",
      children: user?.()?.id && [
        {
          path: "profile",
          title: "My Profile",
          component: UserProfile,
          hidden: !hasRouteAccess("/_/profile"),
        },
        {
          path: "users",
          title: "Manage Users",
          component: Users,
          hidden: !hasRouteAccess("/_/users"),
        },
        {
          path: "users/:id",
          title: "Edit User",
          component: UserEdit,
          hidden: true,
        },
        {
          path: "usage",
          title: "AI Usage Dashboard",
          component: Usage,
          hidden: !hasRouteAccess("/_/usage"),
        },
        {
          path: "users/:id/usage",
          title: "User Usage",
          component: UserUsage,
          hidden: true,
        },
        {
          rawPath: "/api/v1/logout",
          title: "Logout",
        },
      ],
    },
  ];
}
