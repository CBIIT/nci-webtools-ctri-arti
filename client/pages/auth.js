import { createResource, Show, lazy } from "solid-js";
import html from "solid-js/html";

export default function AuthorizedImport(props) {
  return () => html`<${Authorized} ...${props}>${lazy(() => import(props.path))}<//>`;
}

export function Authorized(props) {
  const [authorized] = createResource(() => getAuthorizedUser(props));
  return html`<${Show} when=${authorized}>${props.children}<//>`;
}

export async function getAuthorizedUser(props) {
  const session = await fetch("/api/session").then(r => r.json());
  const { user } = session;
  if (!user) {
    location.href = "/api/login?destination=" + encodeURIComponent(location.pathname);
  } else if (props.roles && !props.roles.includes(user.Role.id)) {
    location.href = "/";
  }
  return user;
}
