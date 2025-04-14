import html from "solid-js/html";

export default function Footer() {
  return html`
  <footer class="bg-transparent text-secondary pt-3 opacity-75">
  <div class="container">
    <div class="row">
      <div class="col-lg-9 col-md-10 mb-3">
        <a
          href="https://datascience.cancer.gov/about/organization/informatics-and-data-science-program-ids/ids"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary h4 mb-1"
          >Clinical &amp; Translational Research Informatics Branch</a
        >
        <div class="h6">
          at the
          <a class="text-danger" target="_blank" rel="noopener noreferrer" href="https://www.cancer.gov/">National Cancer Institute</a>
        </div>
      </div>
      <div class="col-lg-3 col-md-2 text-start text-md-end mb-3">
        <div class="h6 mb-1 text-primary">CONTACT US</div>
        <a class="text-secondary" target="_blank" rel="noopener noreferrer" href="https://datascience.cancer.gov/about/contact">Support</a>
      </div>
    </div>

    <div class="row">
      <div class="col-lg-6 col-md-4 mb-3">
        <div class="h6 mb-1 text-primary">Policies</div>
        <ul class="list-unstyled mb-0">
          <li>
            <a class="text-secondary" target="_blank" rel="noopener noreferrer" href="https://www.cancer.gov/policies/accessibility"
              >Accessibility</a
            >
          </li>
          <li>
            <a class="text-secondary" target="_blank" rel="noopener noreferrer" href="https://www.cancer.gov/policies/disclaimer"
              >Disclaimer</a
            >
          </li>
          <li>
            <a class="text-secondary" target="_blank" rel="noopener noreferrer" href="https://www.cancer.gov/policies/foia">FOIA</a>
          </li>
          <li>
            <a
              class="text-secondary"
              target="_blank"
              rel="noopener noreferrer"
              href="https://www.hhs.gov/vulnerability-disclosure-policy/index.html"
              >HHS Vulnerability Disclosure</a
            >
          </li>
        </ul>
      </div>
      <div class="col-lg-6 col-md-8 text-start text-md-end mb-3">
        <div class="h6 mb-1 text-primary">MORE INFORMATION</div>
        <ul class="list-unstyled mb-0">
          <li>
            <a class="text-secondary" target="_blank" rel="noopener noreferrer" href="http://www.hhs.gov/"
              >U.S. Department of Health and Human Services</a
            >
          </li>
          <li>
            <a class="text-secondary" target="_blank" rel="noopener noreferrer" href="http://www.nih.gov/"
              >National Institutes of Health</a
            >
          </li>
          <li>
            <a class="text-secondary" target="_blank" rel="noopener noreferrer" href="https://www.cancer.gov/"
              >National Cancer Institute</a
            >
          </li>
          <li>
            <a class="text-secondary" target="_blank" rel="noopener noreferrer" href="http://usa.gov/">USA.gov</a>
          </li>
        </ul>
      </div>
    </div>
  </div>
</footer>
  `;
}