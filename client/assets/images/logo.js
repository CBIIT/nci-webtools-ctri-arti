import html from "solid-js/html";

export default function Logo() {
  return html`<svg
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="22.2 214 500 52.2"
    height="50"
  >
    <!-- Edit the viewBox above (x, y, width, height) to adjust for different logo text. In most cases, you just need to edit the width. Note that the width of the first line is always 340, so if the second line is less than this, don't change it. -->
    <style>
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
    <path
      class="gray"
      d="M94.7,240l-14.5-26.1H27.8c-3.1,0-5.6,2.5-5.6,5.6v41c0,3.1,2.5,5.6,5.6,5.6h52.4L94.7,240z"
    />
    <path
      class="red"
      d="M93.3,216.6c-1-1.7-2.9-2.7-4.8-2.7h-4.3L98.8,240l-14.7,26.1h4.3c2,0,3.8-1,4.8-2.7l13.1-23.4L93.3,216.6z"
    />
    <rect class="white" x="53.2" y="228.4" width="3.9" height="23.2" />
    <polygon
      class="white"
      points="45.4,228.4 45.4,245.4 34.8,228.4 30.9,228.4 30.9,251.6 34.8,251.6 34.8,234.6 45.4,251.6 49.3,251.6 49.3,228.4"
    />
    <polygon
      class="white"
      points="75.4,228.4 75.4,238.1 64.8,238.1 64.8,228.4 60.9,228.4 60.9,251.6 64.8,251.6 64.8,241.9 75.4,241.9 75.4,251.6 79.3,251.6 79.3,228.4"
    />
    <text
      class="red"
      x="117.5"
      y="232.5"
      font-family="Montserrat, Arial, sans-serif"
      font-weight="700"
      font-size="15.47"
    >
      NATIONAL CANCER INSTITUTE
    </text>
    <text
      class="gray"
      x="117.2"
      y="258.5"
      font-family="Montserrat, Arial, sans-serif"
      font-weight="700"
      font-size="20.3"
    >
      AI Research &amp; Translational Informatics
    </text>
  </svg>`;
}
