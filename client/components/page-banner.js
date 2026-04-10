import html from "solid-js/html";

/**
 * @param {Object} props
 * @param {string} props.title - The banner heading text
 */
export function PageBanner(props) {
  return html`
    <div class="d-flex align-items-center profile-banner" aria-label="${() => props.title} Banner">
      <div class="container">
        <h1 class="profile-title fw-medium font-outfit text-white mb-0">${() => props.title}</h1>
      </div>
    </div>
  `;
}
