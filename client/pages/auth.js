import { createResource, lazy, Show } from "solid-js";
import html from "solid-js/html";
import { useNavigate } from "@solidjs/router";
import { isAdminSuperUser } from "../utils/roleCheck.js";

export default function AuthorizedImport(props) {
  return () => html`<${Authorized} ...${props}>${lazy(() => import(props.path))}<//>`;
}

export function Authorized(props) {
  const [authorized] = createResource(() => getAuthorizedUser(props));
  return html`<${Show} when=${authorized}>${props.children}<//>`;
}

export async function getAuthorizedUser(props) {
  const navigate = useNavigate();
  const apiKey = new URLSearchParams(location.search).get("apiKey");
  const headers = apiKey ? { "x-api-key": apiKey } : undefined;
  const session = await fetch("/api/v1/session", { headers }).then((r) => r.json());
  const { user } = session;
  const pathToCheck = ["/tools/translator", "/tools/chat"];
  if (!user) {
    location.href =
      "/api/v1/login?destination=" + encodeURIComponent(location.pathname + location.search);
  } else if (props.roles && !props.roles.includes(user.Role?.id)) {
    location.href = "/";
  } else {
    if (pathToCheck.includes(location.pathname) && !isAdminSuperUser(() =>user)) {
      //location.href = "/";
      navigate("/");
      return null;
    }
  }
  return user;
}
