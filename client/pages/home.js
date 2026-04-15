import { For, Show } from "solid-js";
import html from "solid-js/html";

import { Status, useAuthContext } from "../contexts/auth-context.js";
import { canAccess } from "../utils/access.js";

export default function Page() {
  const { access, status, user } = useAuthContext();

  const links = [
    {
      title: "Protocol Composer",
      description: "Compose and manage clinical trial protocols",
      href: "/tools/protocol-composer",
      policy: "/tools/protocol-composer",
      icon: html`<img src="/assets/images/icon-composer-new.svg" height="60" alt="Protocol Composer Icon" />`,
    },
    {
      title: "Protocol Advisor",
      description: "Ensure your protocol document follows rules and compliance standards",
      href: "/tools/protocol-advisor",
      policy: "/tools/protocol-advisor",
      icon: html`<img src="/assets/images/icon-advisor-new.svg" height="60" alt="Protocol Advisor Icon" />`,
    },
    {
      title: "Consent Crafter",
      description: "Process and translate protocols and consent forms",
      href: "/tools/consent-crafter",
      policy: "/tools/consent-crafter",
      icon: html`<img src="/assets/images/icon-crafter-new.svg" height="60" alt="Consent Crafter Icon" />`,
    },
    {
      title: "Consent Translator",
      description: "Accurately translate your documents into multiple languages",
      href: "/tools/translator",
      policy: "/tools/translator",
      icon: html`<img src="/assets/images/icon-translator-new.svg" height="60" alt="Consent Translator Icon" />`,
    },
    {
      title: "Chat",
      description: "Develop with workspace and chat tools",
      href: "/chat",
      policy: "/chat",
      icon: html`<img src="/assets/images/icon-chat-new.svg" height="60" alt="Chat Icon" />`,
    },
    /* {
      title: "New Tools",
      description: "Coming soon",
      href: "/",
      disabled: true,
      icon: html`<img src="/assets/images/icon-books.svg" height="60" alt="New Tools Icon" />`,
    }, */
  ];

  const visibleLinks = () =>
    links.filter((link) => {
      if (!link.policy) return true;
      return status() === Status.LOADED && canAccess(access(), link.policy);
    });

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
                  href="/api/v1/login"
                  target="_self"
                  >Login</a
                >
              <//>
            </div>
          </div>
        </div>
        <div class="col-lg-4 offset-lg-3">
          <div
            id="side-nav-icon-container"
            class="py-3 d-flex flex-column justify-content-center h-100"
          >
            <${For} each=${visibleLinks}>
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
