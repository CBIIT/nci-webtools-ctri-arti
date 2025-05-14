import { onMount, createSignal, onCleanup } from "solid-js";
import html from "solid-js/html";

export default function Footer() {
  const [showButton, setShowButton] = createSignal(false);

  onMount(() => {
    const handleScroll = () => {
      setShowButton(window.scrollY > 1);
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();

    onCleanup(() => {
      window.removeEventListener("scroll", handleScroll);
    });
  });
  const policyLinks = [
    {
      href: "https://www.cancer.gov/policies/accessibility",
      text: "Accessibility",
    },
    {
      href: "https://www.cancer.gov/policies/foia",
      text: "FOIA",
    },
    {
      href: "https://www.cancer.gov/policies/privacy-security",
      text: "Privacy and Security",
    },
    {
      href: "https://www.cancer.gov/policies/disclaimer",
      text: "Disclaimer",
    },
    {
      href: "https://www.hhs.gov/vulnerability-disclosure-policy/index.html",
      text: "Vulnerability Disclosure",
    },
  ];

  const socialMediaLinks = [
    {
      href: "https://www.facebook.com/cancer.gov",
      icon: html`<img
        src="/assets/images/footer/Facebook_Logo.svg"
        height="30"
        width="30"
        alt="facebook-logo"
      />`,
    },
    {
      href: "https://x.com/thenci",
      icon: html`<img
        src="/assets/images/footer/X_Logo.svg"
        height="30"
        width="30"
        alt="x-logo"
      />`,
    },
    {
      href: "https://www.instagram.com/nationalcancerinstitute",
      icon: html`<img
        src="/assets/images/footer/Instagram_Logo.svg"
        height="30"
        width="30"
        alt="instagram-logo"
      />`,
    },
    {
      href: "https://www.youtube.com/NCIgov",
      icon: html`<img
        src="/assets/images/footer/Youtube_Logo.svg"
        height="30"
        width="30"
        alt="youtube-logo"
      />`,
    },
    {
      href: "https://www.linkedin.com/company/nationalcancerinstitute",
      icon: html`<img
        src="/assets/images/footer/LinkedIn_Logo.svg"
        height="30"
        width="30"
        alt="linkedin-logo"
      />`,
    },
  ];

  const contactUsLinks = [
    {
      href: "https://livehelp.cancer.gov/",
      text: "Live Chat",
    },
    {
      href: "tel:1-800-4-CANCER",
      text: "1-800-4-CANCER",
    },
    {
      href: "mailto:+NCIinfo@nih.gov",
      text: "NCIinfo@nih.gov",
    },
    {
      href: "https://nci.az1.qualtrics.com/jfe/form/SV_aeLLobt6ZeGVn5I",
      text: "Site Feedback",
    },
  ];

  const governmentLinks = [
    {
      href: "https://www.hhs.gov/",
      text: "U.S. Department of Health and Human Services",
    },
    {
      href: "https://www.nih.gov/",
      text: "National Institutes of Health",
    },
    {
      href: "https://www.cancer.gov/",
      text: "National Cancer Institute",
    },
    {
      href: "https://usa.gov/",
      text: "USA.gov",
    },
  ];

  return html`
    <footer class="bg-transparent text-secondary pt-3">
      <div
        style="
          background-color: #1f4571;
          height: 278px;
        "
      >
        <div
          class="container d-flex justify-content-center"
          style="color: #ffffff; gap: 90px; padding-top: 26px;"
        >
          <section>
            <div class="footer-section-header">More Information</div>
            <ul class="list-unstyled footer-section-list">
              <li>
                <a href="mailto:+ctribresearchoptimizer@mail.nih.gov">
                  Contact Research Optimizer
                </a>
              </li>

              <li>About Research Optimizer</li>
            </ul>
          </section>
          <section>
            <div class="footer-section-header">Policies</div>
            <ul class="list-unstyled footer-section-list">
              ${policyLinks.map(
                (link) => html`
                  <li>
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      href=${link.href}
                      >${link.text}</a
                    >
                  </li>
                `
              )}
            </ul>
          </section>
          <section>
            <div class="footer-section-header">System Info</div>
            <ul class="list-unstyled footer-section-list">
              <li>Release Notes</li>
              <li>Current Version: 1.0.0</li>
            </ul>
          </section>
        </div>
      </div>
      <div
        style="
          background-color: #122f4b;
          height: 217px;
        "
      >
        <div
          class="container d-flex justify-content-between"
          style="padding-top: 20px; color: #ffffff; height: 70px;"
        >
          <div style="font-family: Poppins;">
            <p style="font-weight: 700; font-size: 24px;">
              National Cancer Institute
            </p>
            <p style="font-weight: 500; font-size: 18px; margin-top: -5px">
              at the National Institutes of Health
            </p>
          </div>
          <div>
            <p
              style="text-align: right; font-family: Poppins; font-weight: 700; font-size: 22px;"
            >
              Contact Us
            </p>
            <div class="d-flex" style="gap: 16px; color: #ffffff;">
              ${contactUsLinks.map((link) =>
                link.href.startsWith("https")
                  ? html`
                      <a
                        class="footer-contact-us"
                        href=${link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        >${link.text}</a
                      >
                    `
                  : html`
                      <a class="footer-contact-us" href=${link.href}
                        >${link.text}</a
                      >
                    `
              )}
            </div>
          </div>
        </div>
        <div
          class="container d-flex justify-content-between"
          style="padding-top: 20px; color: #ffffff;"
        >
          <div>
            <p
              style="font-weight: 700; font-size: 22px; padding: 0px 0px 14px 0px"
            >
              Follow Us
            </p>
            <div class="d-flex" style="gap: 20px;">
              ${socialMediaLinks.map(
                (link) => html`mak
                  <a
                    href=${link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ${link.icon}
                  </a> `
              )}
            </div>
          </div>
          <address class="d-flex flex-column">
            ${governmentLinks.map(
              (link) => html`
                <a
                  class="footer-address-block"
                  href=${link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ${link.text}
                </a>
              `
            )}
          </address>
        </div>
      </div>
      <div
        class=${() => `footer-return-to-top ${showButton() ? "show" : "hide"}`}
        aria-label="Back to Top"
      >
        <a
          href="#top"
          onClick=${(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          ><span>Back to Top</span></a
        >
      </div>
    </footer>
  `;
}
