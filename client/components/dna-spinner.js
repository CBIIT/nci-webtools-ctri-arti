import html from "solid-js/html";
import customElement from "../agents/utils/custom-element.js";
import DNASpinner from "../agents/components/dna-spinner.js";

customElement("dna-spinner", { rotationSpeed: 0.0001 }, (props) => html`<${DNASpinner} ...${props} />`);
