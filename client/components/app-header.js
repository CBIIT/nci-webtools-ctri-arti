export class AppHeader extends HTMLElement {
  static get observedAttributes() {
    return ["title", "subtitle", "viewBox", "svg-height", "svg-width"];
  }

  constructor() {
    super();
    const template = document.createElement("template");
    template.innerHTML = this.getTemplateHTML();
    this.appendChild(template.content.cloneNode(true));

    // Store references to elements we'll need to update
    this._svg = this.querySelector("svg");
    this._titleText = this.querySelector("#title-text");
    this._subtitleText = this.querySelector("#subtitle-text");
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue && this._svg) {
      switch (name) {
        case "title":
          this._titleText.textContent = this.title;
          break;
        case "subtitle":
          this._subtitleText.textContent = this.subtitle;
          break;
        case "viewBox":
          this._svg.setAttribute("viewBox", this.viewBox);
          break;
        case "svg-height":
          this._svg.setAttribute("height", this.svgHeight);
          break;
        case "svg-width":
          this._svg.setAttribute("width", this.svgWidth);
          break;
      }
    }
  }

  get title() {
    return this.getAttribute("title") || "NATIONAL CANCER INSTITUTE";
  }

  get subtitle() {
    return this.getAttribute("subtitle") || "Research Optimizer";
  }

  get viewBox() {
    return this.getAttribute("viewBox") || "22.2 214 340 52.2";
  }

  get svgHeight() {
    return this.getAttribute("svg-height") || "60";
  }

  get svgWidth() {
    return this.getAttribute("svg-width") || "auto";
  }

  getTemplateHTML() {
    return `
      <header class="flex-grow-0">
        <div class="container py-3">
          <a href="/" title="Home" class="d-inline-block">
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" height="${this.svgHeight}" width="${this.svgWidth}" viewBox="${this.viewBox}">
              <!-- Edit the viewBox above (x, y, width, height) to adjust for different logo text. Normally width is sufficient (note: the minimum viewBox width is 340 units) -->
              <style>
                @font-face {
                  font-family: 'Montserrat';
                  font-weight: bold;
                  font-style: normal;
                  src:url("/fonts/Montserrat-700.eot");
                  src:url("/fonts/Montserrat-700.eot?#iefix") format("embedded-opentype"),
                  url("/fonts/Montserrat-700.woff") format("woff"),
                  url("/fonts/Montserrat-700.ttf") format("truetype"),
                  url("/fonts/Montserrat-700.svg#Montserrat") format("svg");
                }
                .gray { fill: #606060; }
                .red { fill: #BB0E3D; }
                .white { fill: #FFFFFF; }
              </style>
              <path class="gray" d="M94.7,240l-14.5-26.1H27.8c-3.1,0-5.6,2.5-5.6,5.6v41c0,3.1,2.5,5.6,5.6,5.6h52.4L94.7,240z" />
              <path class="red" d="M93.3,216.6c-1-1.7-2.9-2.7-4.8-2.7h-4.3L98.8,240l-14.7,26.1h4.3c2,0,3.8-1,4.8-2.7l13.1-23.4L93.3,216.6z" />
              <rect class="white" x="53.2" y="228.4" width="3.9" height="23.2" />
              <polygon class="white" points="45.4,228.4 45.4,245.4 34.8,228.4 30.9,228.4 30.9,251.6 34.8,251.6 34.8,234.6 45.4,251.6 49.3,251.6 49.3,228.4" />
              <polygon class="white" points="75.4,228.4 75.4,238.1 64.8,238.1 64.8,228.4 60.9,228.4 60.9,251.6 64.8,251.6 64.8,241.9 75.4,241.9 75.4,251.6 79.3,251.6 79.3,228.4" />
              <text id="title-text" class="red" x="117.5" y="232.5" font-family="Montserrat" font-weight="700" font-size="15.47">${this.title}</text>
              <text id="subtitle-text" class="gray" x="117.2" y="258.5" font-family="Montserrat" font-weight="700" font-size="20.3">${this.subtitle}</text>
            </svg>
          </a>
        </div>
      </header>
    `;
  }
}

customElements.define("app-header", AppHeader);
