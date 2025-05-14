import { For } from "solid-js";
import html from "solid-js/html";

export default function Page() {
  const links = [
    {
      title: "FedPulse",
      description: "Access real-time guidance on federal policies",
      href: "/agents/fedpulse",
      icon: html`<img src="/assets/images/icon-radar.svg" height="60" alt="FedPulse Icon" />`,
    },
    {
      title: "Chat",
      description: "Develop with workspace and chat tools",
      href: "/tools/chat",
      icon: html`<img src="/assets/images/icon-agents.svg" height="60" alt="Chat Icon" />`,
    },
    {
      title: "ConsentCrafter",
      description: "Process and translate protocols and consent forms",
      href: "/tools/consentcrafter",
      icon: html`<img src="/assets/images/icon-pen.svg" height="60" alt="ConsentCrafter Icon" />`,
    },
    {
      title: "Lay Person Abstract",
      description: "Generate lay person abstracts from protocols",
      href: "/tools/workspaces",
      icon: html`<img src="/assets/images/icon-books.svg" height="60" alt="Lay Person Abstract Icon" />`,
    },
  ];

  return html`
    <div class="container h-100 d-flex flex-column justify-content-center">
      <div class="row">
        <div class="col-lg-8">
          <div class="py-3 d-flex flex-column justify-content-center h-100">
            <h1 class="text-gradient display-3 fw-semibold mb-4">Welcome to Research Optimizer</h1>
            <div class="fs-5 pe-3">
              <p class="mb-3">
                The Research Optimizer is a suite of integrated tools designed to address operational and documentation challenges across
                every stage of the clinical trial lifecycle. By reducing administrative burden, the platform empowers researchers to
                concentrate on scientific discovery and innovation.
              </p>
              <p class="mb-3">Designed by clinical research professionals for clinical research professionals.</p>
              <p class="mb-3">National Cancer Institute - Center for Biomedical Informatics and Information Technology</p>
              <a class="btn btn-primary btn-lg rounded-pill text-decoration-none" href="/api/login" target="_self">Login</a>
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="py-3 d-flex flex-column justify-content-center h-100">
            <${For} each=${links}>
              ${(link) => html`
                <div class="d-flex align-items-center my-3">
                  <a href="${link.href}" class="p-2">${link.icon}</a>
                  <div class="border-start p-2">
                    <a class="text-decoration-none fs-5" href="${link.href}"> ${link.title} </a>
                    <div class="text-secondary">${link.description}</div>
                  </div>
                </div>
              `}
            <//>
          </div>
        </div>
      </div>
    </div>
  `;
}
