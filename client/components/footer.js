import { onMount, createSignal, onCleanup } from "solid-js";
import html from "solid-js/html";

export default function Footer() {
  const [showButton, setShowButton] = createSignal(false);

  onMount(() => {
    const handleScroll = () => {
      setShowButton(window.scrollY > 1); // Show if scrolled down > 100px
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // Run once on mount

    onCleanup(() => {
      window.removeEventListener("scroll", handleScroll);
    });
  });

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
              <li>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://www.cancer.gov/policies/accessibility"
                  >Accessibility</a
                >
              </li>
              <li>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://www.cancer.gov/policies/foia"
                  >FOIA</a
                >
              </li>
              <li>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://www.cancer.gov/policies/privacy-security"
                  >Privacy and Security</a
                >
              </li>
              <li>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://www.cancer.gov/policies/disclaimer"
                  >Disclaimer</a
                >
              </li>
              <li>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://www.hhs.gov/vulnerability-disclosure-policy/index.html"
                  >Vulnerability Disclosure</a
                >
              </li>
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
              <a
                class="footer-contact-us"
                href="https://livehelp.cancer.gov/"
                target="_blank"
                rel="noopener noreferrer"
                >Live Chat</a
              >
              <a class="footer-contact-us" href="tel:1-800-4-CANCER"
                >1-800-4-CANCER</a
              >
              <a class="footer-contact-us" href="mailto:+NCIinfo@nih.gov"
                >NCIinfo@nih.gov</a
              >
              <a
                class="footer-contact-us"
                href="https://nci.az1.qualtrics.com/jfe/form/SV_aeLLobt6ZeGVn5I"
                target="_blank"
                rel="noopener noreferrer"
                >Site Feedback</a
              >
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
              <a
                href="https://www.facebook.com/cancer.gov"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src="../assets/images/footer/Facebook_Logo.svg"
                  alt="facebook-logo"
                  style="width: 30px; height: 30px;"
                />
              </a>
              <a
                href="https://x.com/thenci"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src="../assets/images/footer/X_Logo.svg"
                  alt="x-logo"
                  style="width: 30px; height: 30px;"
                />
              </a>
              <a
                href="https://www.instagram.com/nationalcancerinstitute"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src="../assets/images/footer/Instagram_Logo.svg"
                  alt="instagram-logo"
                  style="width: 30px; height: 30px;"
                />
              </a>
              <a
                href="https://www.youtube.com/NCIgov"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src="../assets/images/footer/Youtube_Logo.svg"
                  alt="youtube-logo"
                  style="width: 30px; height: 30px;"
                />
              </a>
              <a
                href="https://www.linkedin.com/company/nationalcancerinstitute"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src="../assets/images/footer/LinkedIn_Logo.svg"
                  alt="linkedin-logo"
                  style="width: 30px; height: 30px;"
                />
              </a>
            </div>
          </div>
          <address class="d-flex flex-column">
            <a class="footer-address-block" href="https://www.hhs.gov/"
              >U.S. Department of Health and Human Services</a
            >
            <a class="footer-address-block" href="https://www.nih.gov/"
              >National Institutes of Health</a
            >
            <a class="footer-address-block" href="https://www.cancer.gov/"
              >National Cancer Institute
            </a>
            <a class="footer-address-block" href="https://usa.gov/">USA.gov</a>
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
