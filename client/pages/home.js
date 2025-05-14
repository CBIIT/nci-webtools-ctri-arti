import html from "solid-js/html";
import { A } from "@solidjs/router";

export default function Page() {
  const links = [
    {
      title: "FedPulse",
      description: "Access real-time guidance on federal policies",
      href: "/agents/fedpulse",
      icon: html`<img
        src="/assets/images/icon-radar.svg"
        height="60"
        alt="FedPulse Icon"
      />`,
    },
    {
      title: "Chat",
      description: "Develop with workspace and chat tools",
      href: "/tools/chat",
      icon: html`<img
        src="/assets/images/icon-agents.svg"
        height="60"
        alt="Chat Icon"
      />`,
    },
    {
      title: "ConsentCrafter",
      description: "Process and translate protocols and consent forms",
      href: "/tools/consentcrafter",
      icon: html`<img
        src="/assets/images/icon-pen.svg"
        height="60"
        alt="ConsentCrafter Icon"
      />`,
    },
    {
      title: "Lay Person Abstract",
      description: "Generate lay person abstracts from protocols",
      href: "/tools/workspaces",
      icon: html`<img
        src="/assets/images/icon-books.svg"
        height="60"
        alt="Lay Person Abstract Icon"
      />`,
    },
  ];

  return html`
    <main style="height: 893px">
      <div class="container outerPadding">
        <div class="d-flex">
          <div
            class="flex-grow-1"
            style="flex-basis: 70%; max-width: 70%; padding: 200px 0px 0px 88px;"
          >
            <!-- Left content -->
            <h1 class="home-page-gradient home-page-title">
              Welcome to Research Optimizer
            </h1>
            <div class="home-page-content">
              The Research Optimizer is a suite of integrated tools designed to
              address operational and documentation challenges across every
              stage of the clinical trial lifecycle. By reducing administrative
              burden, the platform empowers researchers to concentrate on
              scientific discovery and innovation.
            </div>
            <div class="home-page-content">
              Designed by clinical research professionals for clinical research
              professionals.
            </div>
            <div class="home-page-content">
              National Cancer Institute – Center for Biomedical Informatics and
              Information Technology
            </div>
            <div class="home-page-login">
              <a
                href="/api/login"
                target="_self"
                class="nav-link text-decoration-none home-page-login-link"
              >
                Login
              </a>
            </div>
          </div>

          <div
            class="d-flex flex-column"
            style="flex-basis: 30%; max-width: 30%; padding-top: 250px; gap: 40px;"
          >
            <!-- Right content -->
            ${links.map(
              (link) => html`
                <div class="d-flex align-items-center">
                  <a class="" href="${link.href}"> ${link.icon} </a>
                  <div class="tool-divider"></div>
                  <div class="d-flex flex-column">
                    <a class="home-page-tool-title" href="${link.href}"> ${link.title} </a>
                    <div class="home-page-tool-description">
                      ${link.description}
                    </div>
                  </div>
                </div>
              `
            )}
          </div>
        </div>
      </div>
    </main>
  `;
}
