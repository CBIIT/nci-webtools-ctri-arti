export function getAccessMap(user) {
  if (user?.access && typeof user.access === "object") {
    return user.access;
  }

  return {};
}

export function canAccess(user, path, action = "view") {
  const access = getAccessMap(user);

  return Object.entries(access).some(([prefix, actions]) => {
    if (!actions || typeof actions !== "object") return false;

    const prefixMatch =
      prefix === "*" ||
      path === prefix ||
      path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);

    if (!prefixMatch) return false;

    return Boolean(actions["*"] || actions[action]);
  });
}
