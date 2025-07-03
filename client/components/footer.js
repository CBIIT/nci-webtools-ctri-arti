import { For, Show } from "solid-js";
import html from "solid-js/html";

export default function Footer() {
  const footerLinks = [
    {
      title: "More Info",
      class: "text-lg-start mb-3",
      links: [
        { href: "mailto:ctribresearchoptimizer@mail.nih.gov", content: "Contact Research Optimizer" },
        { href: "/about", content: "About Research Optimizer", internal: true },
      ],
    },
    {
      title: "System Info",
      class: "text-lg-center mb-3",
      links: [
        { href: "https://github.com/CBIIT/nci-webtools-ctri-arti/releases", content: "Release Notes" },
        { href: "https://github.com/CBIIT/nci-webtools-ctri-arti/releases", content: "Current Version: 1.0.0" },
      ],
    },
    {
      title: "Policies",
      class: "text-lg-end",
      links: [
        { href: "https://www.cancer.gov/policies/accessibility", content: "Accessibility" },
        { href: "https://www.cancer.gov/policies/foia", content: "FOIA" },
        { href: "https://www.cancer.gov/policies/privacy-security", content: "Privacy and Security" },
        { href: "https://www.cancer.gov/policies/disclaimer", content: "Disclaimer" },
        { href: "https://www.hhs.gov/vulnerability-disclosure-policy/index.html", content: "Vulnerability Disclosure" },
      ],
    },
  ];

  const socialMediaLinks = [
    {
      href: "https://www.facebook.com/cancer.gov",
      content: html`<img src="/assets/images/footer/icon-facebook.svg" height="30" width="30" alt="facebook-logo" />`,
    },
    {
      href: "https://x.com/thenci",
      content: html`<img src="/assets/images/footer/icon-x.svg" height="30" width="30" alt="x-logo" />`,
    },
    {
      href: "https://www.instagram.com/nationalcancerinstitute",
      content: html`<img src="/assets/images/footer/icon-instagram.svg" height="30" width="30" alt="instagram-logo" />`,
    },
    {
      href: "https://www.youtube.com/NCIgov",
      content: html`<img src="/assets/images/footer/icon-youtube.svg" height="30" width="30" alt="youtube-logo" />`,
    },
    {
      href: "https://www.linkedin.com/company/nationalcancerinstitute",
      content: html`<img src="/assets/images/footer/icon-linkedin.svg" height="30" width="30" alt="linkedin-logo" />`,
    },
  ];

  const contactUsLinks = [
    {
      href: "https://livehelp.cancer.gov/",
      content: "Live Chat",
    },
    {
      href: "tel:1-800-4-CANCER",
      content: "1-800-4-CANCER",
    },
    {
      href: "mailto:NCIinfo@nih.gov",
      content: "NCIinfo@nih.gov",
    },
    {
      href: "https://nci.az1.qualtrics.com/jfe/form/SV_aeLLobt6ZeGVn5I",
      content: "Site Feedback",
    },
  ];

  const governmentLinks = [
    {
      href: "https://www.hhs.gov/",
      content: "U.S. Department of Health and Human Services",
    },
    {
      href: "https://www.nih.gov/",
      content: "National Institutes of Health",
    },
    {
      href: "https://www.cancer.gov/",
      content: "National Cancer Institute",
    },
    {
      href: "https://usa.gov/",
      content: "USA.gov",
    },
  ];

  return html`
    <footer>
      <div class="bg-info text-light py-3">
        <div class="container">
          <div class="row">
            <${For} each=${footerLinks}>
              ${(footer) => html`<div class="col-lg" classList=${{ [footer.class]: true }}>
                  <h3 class="mb-1 font-title">${footer.title}</h3>
                  <ul class="list-unstyled">
                    <${For} each=${footer.links}>
                      ${(link) => 
                        html`
                          <${Show} 
                          fallback=${html`
                             <li>
                              <a class="link-light" href=${link.href} target="_blank">${link.content}</a>
                            </li>`}
                          when=${!link.internal}>
                            <li>
                              <a class="link-light" href=${link.href} target="_blank" rel="noopener noreferrer">${link.content}</a>
                            </li>
                          <//>
                        `
                      }
                  </ul>
                </div>`}
            <//>
          </div>
        </div>  
      </div>
      <div class="bg-primary text-light py-3">
        <div class="container">
          <div class="row">
            <div class="col-lg-6">
              <div class="mb-3 font-title">
                <h3 class="mb-1"><a class="link-light fw-semibold" href="https://www.cancer.gov/" target="_blank" rel="noopener noreferrer">National Cancer Institute</a></h3>
                <h5>
                  <span class="me-1">at the</span>
                  <a class="link-light fw-semibold" href="https://www.nih.gov/" target="_blank" rel="noopener noreferrer">National Institutes of Health</a>
                </h5>
              </div>
              <div>
                <h3 class="mb-1 font-title">Follow Us</h3>
                <ul class="list-inline mb-3">
                  <${For} each=${socialMediaLinks}>
                    ${(link) => html`<li class="list-inline-item">
                      <a class="link-light" target="_blank" rel="noopener noreferrer" href=${link.href}>${link.content}</a>
                    </li>`}
                  <//>
                </ul>
              </div>
            </div>
            <div class="col-lg-6">
              <div class="text-lg-end">
                <h3 class="mb-1 font-title">Contact Us</h3>
                <ul class="list-inline mb-3">
                  <${For} each=${contactUsLinks}>
                    ${(link) => html`<li class="list-inline-item">
                      <a class="link-light" target="_blank" rel="noopener noreferrer" href=${link.href}>${link.content}</a>
                    </li>`}
                  <//>
                </ul>
                <ul class="list-unstyled">
                  <${For} each=${governmentLinks}>
                    ${(link) => html`<li>
                      <a class="link-light" target="_blank" rel="noopener noreferrer" href=${link.href}>${link.content}</a>
                    </li>`}
                  <//>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      <button 
        class="btn btn-secondary btn-sm rounded-start-pill position-fixed end-0 bottom-0 border-bottom-start-0 border-0 visible-scroll ps-4 pt-4 pe-2 pb-2 text-transform-uppercase"
        onClick=${(e) => scrollTo(0, 0)}>
        BACK TO <BR />
        TOP
      </button>
    </footer>
  `;
}
