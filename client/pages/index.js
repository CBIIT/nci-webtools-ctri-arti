const { search, hostname } = window.location;
const params = new URLSearchParams(search);
const isBrowserTest = params.has("test") && hostname === "localhost";

if (!isBrowserTest) {
  const { Router } = await import("@solidjs/router");
  const html = (await import("solid-js/html")).default;
  const { render } = await import("solid-js/web");
  const { AuthProvider } = await import("../contexts/auth-context.js");
  const Layout = (await import("./layout.js")).default;
  const getRoutes = (await import("./routes.js")).default;

  render(
    () => html`
      <${AuthProvider}> ${() => html`<${Router} root=${Layout}>${getRoutes()}<//>`} <//>
    `,
    window.app
  );
}

if (isBrowserTest) {
  try {
    await import("../test/run.js");
  } finally {
    window.TESTS_DONE = true;
  }
}
