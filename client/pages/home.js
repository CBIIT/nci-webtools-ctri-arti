import { For, Show, createResource } from "solid-js";
import html from "solid-js/html";

export default function Page() {
  const [session] = createResource(() => fetch("/api/session").then((res) => res.json()));
  const links = [
    {
      title: "FedPulse",
      description: "Access real-time guidance on federal policies",
      href: "/tools/fedpulse",
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
      href: "/tools/consent-crafter",
      icon: html`<img src="/assets/images/icon-pen.svg" height="60" alt="ConsentCrafter Icon" />`,
    },
    {
      title: "Lay Person Abstract",
      description: "Generate lay person abstracts from protocols",
      href: "/tools/lay-person-abstract",
      icon: html`<img src="/assets/images/icon-books.svg" height="60" alt="Lay Person Abstract Icon" />`,
    },
  ];

  return html`
    <div class="container h-100 d-flex flex-column justify-content-center">
      <div class="row gx-5 p-5 my-5">
        <div class="col-lg-6">
          <div class="py-3 d-flex flex-column justify-content-center h-100">
            <h1 class="text-gradient display-5 font-title fw-normal mb-1">Welcome to ARTI</h1>
            <h2 class="text-gradient fs-3 font-title fw-normal mb-4">AI Research & Translational Informatics</h2>
            <div class="text-secondary">
              <p class="mb-3">
                Powering the Research Optimizer platform with intelligent tools that address documentation challenges throughout the clinical trial lifecycle.
                <br/>
                ARTI enables researchers to focus on scientific advancement rather than administrative burdens.
              </p>
              <p class="mb-3">Developed by clinical research professionals for clinical research professionals.</p>
              <p class="mb-3">An initiative of the National Cancer Institute – Center for Biomedical Informatics and Information Technology</p>
              <${Show} when=${() => !session()?.user}>
                <a class="btn btn-primary rounded-pill text-decoration-none" href="/api/login" target="_self">Login</a>
              <//>
            </div>
          </div>
        </div>
        <div class="col-lg-5 offset-lg-1">
          <div class="py-3 d-flex flex-column justify-content-center h-100">
            <${For} each=${links}>
              ${(link) => html`
                <a class="d-flex align-items-center my-3 text-decoration-none link-primary" href="${link.href}">
                  <div class="p-2 text-gradient">${link.icon}</div>
                  <div class="p-2 border-start">
                    <div class="font-title fs-5 textAnchorBlue">${link.title}</div>
                    <div class="fw-normal text-primary">${link.description}</div>
                  </div>
                </a>
              `}
            <//>
          </div>
        </div>
      </div>
    </div>
  `;
}
