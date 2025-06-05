import { lazy } from "solid-js";
import html from "solid-js/html";
import Home from "./home.js";
import ProtectedRoute from "./protected-routes.js";
const Chat = () => import("./agents/chat.js");
const FedPulse = () => import("./agents/fedpulse.js");
const ConsentCrafter = () => import("./tools/consent-crafter.js");
const LayPersonAbstract = () => import("./tools/lay-person-abstract.js");
const Users = () => import("./users/index.js");
const UserEdit = () => import("./users/edit.js");
const UserUsage = () => import("./users/usage.js");

const baseRoutes = [
  {
    path: "",
    title: "Home",
    component: Home,
    hidden: false,
    protected: false,
  },
  {
    path: "/tools",
    title: "Tools",
    protected: false,
    children: [
      {
        path: "fedpulse",
        title: "FedPulse",
        component: FedPulse,
        protected: true,
      },
      {
        path: "chat",
        title: "Chat",
        component: Chat,
        protected: true,
      },
      {
        path: "consentcrafter",
        title: "ConsentCrafter",
        component: ConsentCrafter,
        protected: true,
      },
      {
        path: "laypersonabstract",
        title: "Lay Person Abstract",
        component: LayPersonAbstract,
        protected: true,
      }
    ]
  },
  {
    path: "/users",
    title: "Users",
    component: Users,
    hidden: true,
    protected: true,
    loginNavbar: true,
    loginNavbarTitle: 'Manage Users',
    allowedRoles: [ 1 ],
  },
  {
    path: "/user/:id",
    title: "User",
    component: UserEdit,
    hidden: true,
    protected: true,
  },
  {
    path: "/user/:id/usage",
    title: "User Usage",
    component: UserUsage,
    hidden: true,
    protected: true,
  }
];
// Function to process routes and wrap protected ones with ProtectedRoute
function processRoutes(routes) {
  return routes.map(route => {
    const processedRoute = { ...route };
    
    // Handle children routes
    if (route.children) {
      processedRoute.children = route.children.map(child => {
        if (child.protected && child.component) {
          return {
            ...child,
            component: () => html`
              <${ProtectedRoute}>
                <${lazy(child.component)} />
              <//>
            `,
          };
        }
        else if (child.component) {
          return {
            ...child,
            component: () => html`
              <${lazy(child.component)} />
            `,
          };
        }
      });
    }
    
    // Handle top-level protected routes 
    if (route.protected && !route.children) {
      processedRoute.component = () => html`
        <${ProtectedRoute}>
          <${lazy(route.component)} />
        <//>
      `;
    }
    else if (!route.protected && route.path !== "" && route.component) {
      processedRoute.component = () => html`
        <${lazy(route.component)} />
      `;
    }
    return processedRoute;
  });
}

const routes = processRoutes(baseRoutes);

export default routes;