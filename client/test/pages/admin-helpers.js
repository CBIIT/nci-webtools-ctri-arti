import { installMockFetch, jsonResponse, waitForElement } from "../helpers.js";

const ADMIN_ACCESS = { "*": { "*": true } };
const SUPER_USER_ACCESS = {
  "/tools/chat": { view: true },
  "/tools/chat-v2": { view: true },
  "/tools/consent-crafter": { view: true },
  "/tools/translator": { view: true },
  "/tools/semantic-search": { view: true },
  "/tools/export-conversations": { view: true },
  "/_/profile": { view: true },
};
const USER_ACCESS = {
  "/tools/consent-crafter": { view: true },
  "/tools/translator": { view: true },
  "/tools/semantic-search": { view: true },
  "/tools/export-conversations": { view: true },
  "/_/profile": { view: true },
};

function accessForRole(roleID) {
  if (roleID === 1) return ADMIN_ACCESS;
  if (roleID === 2) return SUPER_USER_ACCESS;
  return USER_ACCESS;
}

export const baseUser = {
  id: 1,
  email: "integration@example.org",
  firstName: "Integration",
  lastName: "Tester",
  status: "active",
  roleID: 1,
  budget: 10,
  remaining: 9.59,
  Role: { id: 1, name: "admin" },
  access: ADMIN_ACCESS,
};

const roles = [
  { id: 1, name: "admin" },
  { id: 2, name: "super_admin" },
  { id: 3, name: "user" },
];

function buildUsersResponse(url, user) {
  let data = [{ ...user, Role: user.Role }];
  const search = (url.searchParams.get("search") || "").toLowerCase();
  const status = url.searchParams.get("status");
  const roleID = url.searchParams.get("roleID");

  if (search) {
    const haystack = `${user.email} ${user.firstName} ${user.lastName}`.toLowerCase();
    data = haystack.includes(search) ? data : [];
  }

  if (status) {
    data = data.filter((entry) => entry.status === status);
  }

  if (roleID) {
    data = data.filter((entry) => String(entry.roleID) === String(roleID));
  }

  return { data, meta: { total: data.length } };
}

export function installAdminMocks() {
  let currentUser = structuredClone(baseUser);
  const userListQueries = [];

  const restoreFetch = installMockFetch(async ({ url, request, originalFetch }) => {
    if (url.pathname === "/api/v1/session") {
      return jsonResponse({
        user: currentUser,
        access: currentUser.access,
        expires: "2099-01-01T00:00:00.000Z",
      });
    }

    if (url.pathname === "/api/config") {
      return jsonResponse({ budgetLabel: "Monthly" });
    }

    if (url.pathname === "/api/v1/admin/roles") {
      return jsonResponse(roles);
    }

    if (url.pathname === "/api/v1/admin/users" && request.method === "GET") {
      userListQueries.push({
        search: url.searchParams.get("search"),
        status: url.searchParams.get("status"),
        roleID: url.searchParams.get("roleID"),
        sortBy: url.searchParams.get("sortBy"),
        sortOrder: url.searchParams.get("sortOrder"),
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset"),
      });
      return jsonResponse(buildUsersResponse(url, currentUser));
    }

    if (url.pathname === `/api/v1/admin/users/${currentUser.id}` && request.method === "GET") {
      return jsonResponse(currentUser);
    }

    if (url.pathname === "/api/v1/admin/users" && request.method === "POST") {
      const body = await request.json();
      const nextRole =
        roles.find((role) => role.id === Number(body.roleID || currentUser.roleID)) ||
        currentUser.Role;
      currentUser = {
        ...currentUser,
        ...body,
        id: currentUser.id,
        roleID: Number(body.roleID || currentUser.roleID),
        Role: { id: nextRole.id, name: nextRole.name },
        access: accessForRole(nextRole.id),
      };
      return jsonResponse(currentUser);
    }

    if (url.pathname === "/api/v1/admin/analytics") {
      const groupBy = url.searchParams.get("groupBy");

      if (groupBy === "user") {
        return jsonResponse({
          data: [
            {
              userID: currentUser.id,
              User: currentUser,
              Role: currentUser.Role,
              totalRequests: 3,
              usageCost: 0.3,
              guardrailCost: 0.01,
              totalCost: 0.31,
            },
          ],
          meta: { total: 1 },
        });
      }
    }

    return originalFetch(request);
  });

  return {
    restore() {
      restoreFetch();
    },
    userListQueries,
    clearUserListQueries() {
      userListQueries.length = 0;
    },
  };
}

export async function chooseInlineSelectOption(container, triggerSelector, label) {
  const trigger = await waitForElement(container, triggerSelector);
  trigger.click();

  const option = await waitForElement(container, ".custom-dropdown-option", (el) =>
    el.textContent.trim().includes(label)
  );
  option.click();

  return waitForElement(container, triggerSelector, (el) => el.textContent.includes(label), 2000);
}
