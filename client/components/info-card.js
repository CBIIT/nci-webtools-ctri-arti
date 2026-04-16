import { For } from "solid-js";
import html from "solid-js/html";

/**
 * @param {Object} props
 * @param {string} [props.class] - Additional CSS classes for the card container
 * @param {Array<{icon: string, iconAlt: string, title: string, description: any}>} props.items - The items to display in the info card
 * @returns {JSX.Element}
 */
export function InfoCard(props) {
  return html`
    <div class=${() => `info-card ${props.class || ""}`}>
      <${For} each=${() => props.items}>
        ${(item) => html`
          <div class="info-card-item d-flex">
            <img class="info-card-icon flex-shrink-0" src=${item.icon} alt=${item.iconAlt} />
            <div class="d-flex flex-column">
              <span class="info-card-title font-poppins fw-semibold text-white">${item.title}</span>
              ${item.description}
            </div>
          </div>
        `}
      <//>
    </div>
  `;
}
