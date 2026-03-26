import { createMemo, createRenderEffect, lazy, Show } from "solid-js";
import html from "solid-js/html";

import { Status, useAuthContext } from "../contexts/auth-context.js";

export default function AuthorizedImport(props) {
  return () => html`<${Authorized} ...${props}>${lazy(() => import(props.path))}<//>`;
}

export function Authorized(props) {
  const auth = useAuthContext();

  const authorized = createMemo(() => {
    if (auth.status() !== Status.LOADED) return false;
    const user = auth.user();
    if (!user) return false;
    if (props.roles && !props.roles.includes(user.Role?.id)) return false;
    return true;
  });

  createRenderEffect(() => {
    if (auth.status() !== Status.LOADED) return;
    if (!auth.user()) {
      location.href =
        "/api/v1/login?destination=" + encodeURIComponent(location.pathname + location.search);
      return;
    }
    if (props.roles && !props.roles.includes(auth.user()?.Role?.id)) {
      location.href = "/";
      return;
    }
  });

  return html`<${Show} when=${authorized}>${props.children}<//>`;
}
