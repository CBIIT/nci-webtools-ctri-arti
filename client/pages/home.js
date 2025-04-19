import html from "solid-js/html";
import { A } from "@solidjs/router";
import DNASpinner from "../components/dna.js";

export default function Page() {
  const links = [
    {
      title: "FedPulse",
      description: "Access real-time guidance on federal policies",
      href: "/agents/fedpulse",
      icon: html`<img src="/assets/images/icon-radar.svg" class="mt-2 mb-4" height="60" alt="FedPulse Icon" />`,
    },
    {
      title: "ConsentCrafter",
      description: "Process and translate protocols and consent forms",
      href: "/tools/consentcrafter",
      icon: html`<img src="/assets/images/icon-pen.svg" class="mt-2 mb-4" height="60" alt="ConsentCrafter Icon" />`,
    },
    {
      title: "Tools",
      description: "Develop with workspace and chat tools",
      href: "/tools",
      icon: html`<img src="/assets/images/icon-agents.svg" class="mt-2 mb-4" height="60" alt="Tools Icon" />`,
    },
  ];

  return html`
  <main class="d-flex-center flex-column flex-grow-1 position-relative py-4">
  <${DNASpinner} class="background-object h-100" rotationSpeed=${0.001} />
  <div class="container">
    <div class="row">
      <div class="col-md mb-4 d-flex-center">
        <div class="p-4 rounded text-center bg-light-opacity" style="max-width: 720px">
          <h1 class="text-gradient fw-bold font-title mb-3">Welcome to Research Optimizer</h1>
          <div class="text-secondary fw-semibold">
            Research Optimizer provides tools to query, transform, and analyze biomedical and regulatory information. Supporting
            the Clinical & Translational Research Informatics Branch (CTRIB) mission, we streamline workflows and make insights
            accessible for clinical, research, and regulatory work.
          </div>
        </div>
      </div>
    </div>

    <div class="row">
      <div class="col">
        <h1 class="text-center h5 text-primary font-title opacity-75 mb-3">Get Started</h1>
      </div>
    </div>

    <div class="row">
      ${links.map(
        (link) => html`
          <div class="col-md-4 mb-4">
            <a
              class="p-3 shadow-sm rounded text-center bg-light-opacity d-flex-center flex-column border-0 shadow-hover text-decoration-none h-100"
              href="${link.href}">
              ${link.icon}
              <h5 class="card-title mb-3 text-primary font-title">${link.title}</h5>
              <p class="card-text text-secondary flex-grow-1">${link.description}</p>
            </a>
          </div>
        `
      )}
  </div>
</main>
  `;
}
