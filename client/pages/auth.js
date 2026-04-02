import { useNavigate } from "@solidjs/router";
import { createMemo, createRenderEffect, lazy, onMount, Show } from "solid-js";
import html from "solid-js/html";

import { Status, useAuthContext } from "../contexts/auth-context.js";
import { canAccess } from "../utils/access.js";

export default function AuthorizedImport(props) {
  return () => html`<${Authorized} ...${props}>${lazy(() => import(props.path))}<//>`;
}

export function Authorized(props) {
  const auth = useAuthContext();
  const navigate = useNavigate();

  onMount(() => {
    auth.checkSession();
  });

  const authorized = createMemo(() => {
    if (auth.status() !== Status.LOADED) return false;
    const user = auth.user();
    if (!user) return false;
    if (props.policy && !canAccess(auth.access(), props.policy, props.action)) return false;
    return true;
  });

  createRenderEffect(() => {
    if (auth.status() !== Status.LOADED) return;
    if (!auth.user() && auth.accountDeactivated?.()) {
      navigate("/", { replace: true });
      return;
    }
    if (!auth.user()) {
      location.href =
        "/api/v1/login?destination=" + encodeURIComponent(location.pathname + location.search);
      return;
    }
    if (props.policy && !canAccess(auth.access(), props.policy, props.action)) {
      navigate("/", { replace: true });
      return;
    }
  });

  return html`<${Show} when=${authorized}>${props.children}<//>`;
}
