import { createResource, Show, onMount, createEffect } from "solid-js";
import html from "solid-js/html";
import { useLocation } from "@solidjs/router";

export default function ProtectedRoute(props) {
  const [session] = createResource(() =>
    fetch("/api/session").then((res) => res.json())
  );
  const location = useLocation();
  return html`
    <${Show}
      when=${() => session()?.user}
      fallback=${() => {
        if (!session.loading)
        {
          onMount(() => {
          const target =
            "/api/login?destination=" + encodeURIComponent(location.pathname);
          window.location.href = target; // ← Use hard redirect
        });
        }
        return html`<p></p>`; // mandatory return statement
      }}
    >
      ${props.children}
    <//>
  `;
}
