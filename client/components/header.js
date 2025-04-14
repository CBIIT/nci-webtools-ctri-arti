import html from "solid-js/html";
import { createSignal } from "solid-js";

export default function Header({
  title = "NATIONAL CANCER INSTITUTE",
  subtitle = "Research Optimizer",
  svgHeight = "60",
  svgWidth = "auto",
  viewBox = "22.2 214 340 52.2",
}) {
  const [hidden, setHidden] = createSignal(true);
  const toggleHidden = () => setHidden(!hidden());

  return html`
    <header class="flex-grow-0">
      <div class="bg-light ">
        <div class="container">
          <div class="row">
            <div class="col small">
              <span class="me-1">
                <img src="/images/icon-flag.svg" alt="U.S. Flag" width="16" class="me-1" />
                An official website of the United States government</span>
                
              <button type="button" onClick=${toggleHidden} class="p-0 bg-transparent border-0 link-secondary fw-normal" href="#"><span class="text-decoration-underline me-1">Here’s how you know</span> 
              <small class="opacity-50">${() => hidden() ? "🡣" : "🡡"}</small>
              </button>
            </div>
          </div>

          <div class="row" hidden=${hidden}>
            <div class="col-md-6 py-4 d-flex">
              <img src="/images/icon-dot-gov.svg" alt="dot-gov" height="40" class="me-2" />
              <div>
                <strong>Official websites use .gov</strong>
                <div>A <strong>.gov</strong> website belongs to an official government organization in the United States.</div>
              </div>
            </div>

            <div class="col-md-6 py-4 d-flex">
              <img src="/images/icon-https.svg" alt="https" height="40" class="me-2" />
              <div>
                <strong>Secure .gov websites use HTTPS</strong>
                <div>
                  A <strong>lock</strong> (
                  <svg xmlns="http://www.w3.org/2000/svg" width="9" height="12" viewBox="0 5 52 64" role="img">
                    <path
                      fill="steelblue"
                      fill-rule="evenodd"
                      d="M26 0c10.493 0 19 8.507 19 19v9h3a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V32a4 4 0 0 1 4-4h3v-9C7 8.507 15.507 0 26 0zm0 8c-5.979 0-10.843 4.77-10.996 10.712L15 19v9h22v-9c0-6.075-4.925-11-11-11z"></path>
                  </svg>
                  ) or <strong>https://</strong> means you’ve safely connected to the .gov website. Share sensitive information only on
                  official, secure websites.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="container py-3">
        <a href="/" title="Home" class="d-inline-block">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" height="${svgHeight}" width="${svgWidth}" viewBox="${viewBox}">
            <!-- Edit the viewBox above (x, y, width, height) to adjust for different logo text. Normally width is sufficient (note: the minimum viewBox width is 340 units) -->
            <style>
              @font-face {
                font-family: "Montserrat";
                font-weight: bold;
                font-style: normal;
                src: url("/fonts/Montserrat-700.eot");
                src: url("/fonts/Montserrat-700.eot?#iefix") format("embedded-opentype"), url("/fonts/Montserrat-700.woff") format("woff"),
                  url("/fonts/Montserrat-700.ttf") format("truetype"), url("/fonts/Montserrat-700.svg#Montserrat") format("svg");
              }
              .gray {
                fill: #606060;
              }
              .red {
                fill: #bb0e3d;
              }
              .white {
                fill: #ffffff;
              }
            </style>
            <path class="gray" d="M94.7,240l-14.5-26.1H27.8c-3.1,0-5.6,2.5-5.6,5.6v41c0,3.1,2.5,5.6,5.6,5.6h52.4L94.7,240z" />
            <path class="red" d="M93.3,216.6c-1-1.7-2.9-2.7-4.8-2.7h-4.3L98.8,240l-14.7,26.1h4.3c2,0,3.8-1,4.8-2.7l13.1-23.4L93.3,216.6z" />
            <rect class="white" x="53.2" y="228.4" width="3.9" height="23.2" />
            <polygon
              class="white"
              points="45.4,228.4 45.4,245.4 34.8,228.4 30.9,228.4 30.9,251.6 34.8,251.6 34.8,234.6 45.4,251.6 49.3,251.6 49.3,228.4" />
            <polygon
              class="white"
              points="75.4,228.4 75.4,238.1 64.8,238.1 64.8,228.4 60.9,228.4 60.9,251.6 64.8,251.6 64.8,241.9 75.4,241.9 75.4,251.6 79.3,251.6 79.3,228.4" />
            <text id="title-text" class="red" x="117.5" y="232.5" font-family="Montserrat" font-weight="700" font-size="15.47">
              ${title}
            </text>
            <text id="subtitle-text" class="gray" x="117.2" y="258.5" font-family="Montserrat" font-weight="700" font-size="20.3">
              ${subtitle}
            </text>
          </svg>
        </a>
      </div>
    </header>
  `;
}
