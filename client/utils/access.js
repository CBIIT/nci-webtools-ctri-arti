export function getAccessMap(access) {
  if (access && typeof access === "object") {
    return access;
  }

  return {};
}

export function canAccess(access, path, action = "view") {
  const accessMap = getAccessMap(access);

  return Object.entries(accessMap).some(([prefix, actions]) => {
    if (!actions || typeof actions !== "object") return false;

    const prefixMatch =
      prefix === "*" ||
      path === prefix ||
      path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);

    if (!prefixMatch) return false;

    return Boolean(actions["*"] || actions[action]);
  });
}
