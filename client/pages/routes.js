import html from "solid-js/html";

import { useAuthContext } from "../contexts/auth-context.js";

import AuthorizedImport from "./auth.js";
import Home from "./home.js";

const Chat = AuthorizedImport({ path: "./tools/chat/index.js", roles: [1, 2] });
const ChatV2 = AuthorizedImport({ path: "./tools/chat-v2/index.js", roles: [1, 2] });
const ConsentCrafter = AuthorizedImport({ path: "./tools/consent-crafter/index.js", roles: [1, 2] });
const Translate = AuthorizedImport({ path: "./tools/translate/index.js", roles: [1, 2] });
const SemanticSearch = AuthorizedImport({ path: "./tools/semantic-search.js" });
const ExportConversations = AuthorizedImport({ path: "./tools/export-conversations/index.js" });
const Users = AuthorizedImport({ path: "./users/index.js", roles: [1] });
const UserEdit = AuthorizedImport({ path: "./users/edit.js", roles: [1] });
const UserProfile = AuthorizedImport({ path: "./users/profile.js" });
const Usage = AuthorizedImport({ path: "./users/usage/usage.js", roles: [1] });
const UserUsage = AuthorizedImport({ path: "./users/user-usage.js", roles: [1] });

/**
 * Generate site routes.
 *
 * @returns {Array} - Array of route configurations
 */
export default function getRoutes() {
  const { user } = useAuthContext();

  const hasAnyRole = (roleIds) => user?.() && roleIds.includes(user?.()?.Role?.id);

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
          hidden: !hasAnyRole([1, 2]),
        },
        {
          path: "chat-v2",
          title: html`<span>Chat<sup class="text-warning">v2</sup></span>`,
          component: ChatV2,
          hidden: !hasAnyRole([1, 2]),
        },
        {
          path: "consent-crafter",
          title: "ConsentCrafter",
          component: ConsentCrafter,
          hidden: false,
        },
        {
          path: "translator",
          title: "Translator",
          component: Translate,
          hidden: !hasAnyRole([1, 2]),
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
      ].filter((route) => !route.hidden),
    },
    {
      path: "/_",
      rawPath: !user?.() ? "/api/v1/login" : undefined,
      title: user?.() ? user?.().firstName || "User" : "Login",
      class: "ms-lg-auto",
      children:
        user?.()?.id &&
        [
          {
            path: "profile",
            title: "My Profile",
            component: UserProfile,
          },
          {
            path: "users",
            title: "Manage Users",
            component: Users,
            hidden: !hasAnyRole([1]),
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
            hidden: !hasAnyRole([1]),
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
        ].filter((route) => !route.hidden),
    },
  ];
}
