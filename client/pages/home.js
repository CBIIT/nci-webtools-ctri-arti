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
      title: "New Tools",
      description: "Coming soon",
      href: "/",
      disabled: true,
      icon: html`<img src="/assets/images/icon-books.svg" height="60" alt="New Tools Icon" />`,
    },
  ];

  return html`
    <div class="container h-100 d-flex flex-column justify-content-center font-smooth">
      <div class="row gx-5 p-24 mt-136 mb-140">
        <div class="col-lg-6 pl-88">
          <div class="py-3 d-flex flex-column justify-content-center h-100">
            <h1
              class="font-manrope fw-semibold fs-75 lh-60 ls--2 minh-138 text-clip text-gradient-blue-teal mb-12"
            >
              Research Optimizer
            </h1>
            <h2 class="font-inter fw-medium fs-30 lh-35 ls-00025em text-black mb-5 mw-510">
              Manage, query, transform, and analyze biomedical and regulatory information.
            </h2>
            <div class="font-inter fw-light fs-18 lh-27 ls-00025em text-black">
              <div class="mw-510">
                <p class="mb-35">
                  Supporting the Clinical & Translational Research Informatics Branch (CTRIB)
                  mission, the NCI Research Optimizer streamlines workflow and makes insights
                  accessible for clinical, research, and regulatory work.
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
        <div class="col-lg-4 offset-lg-2">
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
