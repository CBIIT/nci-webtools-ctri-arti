import { For, Show } from "solid-js";
import html from "solid-js/html";

import { useAuthContext } from "../contexts/auth-context.js";

export default function Page() {
  const { user } = useAuthContext();

  const links = [
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
      title: "Translator",
      description: "Accurately translate your documents into multiple languages",
      href: "/tools/translator",
      icon: html`<img src="/assets/images/icon-translate.svg" height="60" alt="Translator Icon" />`,
    },
    {
      title: "New Tools",
      description: "Coming soon",
      href: "/",
      disabled: true,
      icon: html`<img src="/assets/images/icon-books.svg" height="60" alt="New Tools Icon" />`,
    },
  ];

  return html`
    <div class="container h-100 d-flex flex-column justify-content-center font-smooth">
      <div class="row gx-5 px-5 mt-10 mb-9">
        <div class="col-lg-5  ps-5">
          <div class="py-3 d-flex flex-column justify-content-center h-100">
            <h1
              class="font-manrope display-2 fw-semibold lh-xs text-clip text-spacing--1 text-gradient-blue-teal pb-4"
            >
              Research Optimizer
            </h1>
            <h2 class="font-inter fw-medium fs-2 lh-sm text-black mb-5">
              AI Research & Translational Informatics
            </h2>
            <div class="font-inter lead">
              <div class="mb-4">
                <p class="mb-3">
                  Powering the Research Optimizer platform with intelligent tools that address
                  documentation challenges throughout the clinical trial lifecycle. AI Research &
                  Translational Informatics enables researchers to focus on scientific advancement
                  rather than administrative burdens.
                </p>
                <p class="mb-3">
                  Developed by clinical research professionals for clinical research professionals.
                </p>
                <p class="mb-3">
                  An initiative of the National Cancer Institute – Center for Biomedical Informatics
                  and Information Technology
                </p>
              </div>
              <${Show} when=${() => !user()}>
                <a
                  class="btn btn-wide btn-wide-primary text-decoration-none"
                  href="/api/login"
                  target="_self"
                  >Login</a
                >
              <//>
            </div>
          </div>
        </div>
        <div class="col-lg-4 offset-lg-3">
          <div class="py-3 d-flex flex-column justify-content-center h-100">
            <${For} each=${links}>
              ${(link) => html`
                <a
                  class="d-flex align-items-center my-3 text-decoration-none link-primary"
                  classList=${{ "disabled-link": link.disabled }}
                  href="${link.href}"
                >
                  <div class="p-2 text-gradient">${link.icon}</div>
                  <div class="p-2 border-start">
                    <div class="font-title fs-5 textAnchorBlue">${link.title}</div>
                    <div
                      class="fw-normal"
                      classList=${{ "text-primary": !link.disabled, "text-muted": link.disabled }}
                    >
                      ${link.description}
                    </div>
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
