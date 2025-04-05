const template = document.createElement("template");
template.innerHTML = `
<footer class="flex-grow-0">
  <div class="bg-primary-dark text-light py-4">
    <div class="container">
      <div class="d-flex flex-wrap justify-content-between">
        <div class="mb-4">
          <a
            href="https://datascience.cancer.gov/about/organization/informatics-and-data-science-program-ids/ids"
            target="_blank"
            rel="noopener noreferrer"
            class="text-light h4 mb-1"
            >Clinical &amp; Translational Research Informatics Branch</a
          >
          <div class="h6">
            at the
            <a class="text-light" target="_blank" rel="noopener noreferrer" href="https://www.cancer.gov/">National Cancer Institute</a>
          </div>
        </div>
        <div class="text-start text-lg-end mb-4">
          <div class="text-light h4 mb-1">Contact Us</div>
          <a class="text-light" target="_blank" rel="noopener noreferrer" href="https://datascience.cancer.gov/about/contact">General Support</a>
        </div>
      </div>

      <div class="row">
        <div class="col-lg-6 mb-4 ">
          <div class="h6 mb-1">POLICIES</div>
          <ul class="list-unstyled mb-0">
            <li>
              <a class="text-light" target="_blank" rel="noopener noreferrer" href="https://www.cancer.gov/policies/accessibility"
                >Accessibility</a
              >
            </li>
            <li>
              <a class="text-light" target="_blank" rel="noopener noreferrer" href="https://www.cancer.gov/policies/disclaimer"
                >Disclaimer</a
              >
            </li>
            <li>
              <a class="text-light" target="_blank" rel="noopener noreferrer" href="https://www.cancer.gov/policies/foia">FOIA</a>
            </li>
            <li>
              <a
                class="text-light"
                target="_blank"
                rel="noopener noreferrer"
                href="https://www.hhs.gov/vulnerability-disclosure-policy/index.html"
                >HHS Vulnerability Disclosure</a
              >
            </li>
          </ul>
        </div>
        <div class="col-lg-6 mb-4">
          <div class="h6 mb-1 text-start text-lg-end">MORE INFORMATION</div>
          <ul class="list-unstyled text-start text-lg-end mb-0">
            <li>
              <a class="text-light" target="_blank" rel="noopener noreferrer" href="http://www.hhs.gov/"
                >U.S. Department of Health and Human Services</a
              >
            </li>
            <li>
              <a class="text-light" target="_blank" rel="noopener noreferrer" href="http://www.nih.gov/"
                >National Institutes of Health</a
              >
            </li>
            <li>
              <a class="text-light" target="_blank" rel="noopener noreferrer" href="https://www.cancer.gov/"
                >National Cancer Institute</a
              >
            </li>
            <li>
              <a class="text-light" target="_blank" rel="noopener noreferrer" href="http://usa.gov/">USA.gov</a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</footer>
`;

export class AppFooter extends HTMLElement {
  constructor() {
    super();
    this.appendChild(template.content.cloneNode(true));
  }
}

customElements.define("app-footer", AppFooter);
