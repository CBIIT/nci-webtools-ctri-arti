import { createResource, lazy, Show } from "solid-js";
import html from "solid-js/html";

import { fetchCachedJson } from "../utils/static-data.js";

export default function AuthorizedImport(props) {
  return () => html`<${Authorized} ...${props}>${lazy(() => import(props.path))}<//>`;
}

export function Authorized(props) {
  const [authorized] = createResource(() => getAuthorizedUser(props));
  return html`<${Show} when=${authorized}>${props.children}<//>`;
}

export async function getAuthorizedUser(props) {
  const apiKey = new URLSearchParams(location.search).get("apiKey");
  const headers = apiKey ? { "x-api-key": apiKey } : undefined;
  const session = await fetch("/api/v1/session", { headers }).then((r) => r.json());
  const { user } = session;
  if (!user) {
    location.href =
      "/api/v1/login?destination=" + encodeURIComponent(location.pathname + location.search);
  } else if (props.roles && !props.roles.includes(user.Role?.id)) {
    location.href = "/";
  } else if (location.pathname.startsWith("/tools/")) {
    const toolPath = location.pathname.replace("/tools/", "").split("/")[0];
    const config = await fetchCachedJson("/api/v1/config").catch(() => null);
    const setting = config?.appToolSettings?.find((s) => s.name === toolPath);
    if (setting && !setting.enabled) {
      location.href = "/";
      return null;
    }
  }
  return user;
}
