const template = document.createElement('template');
template.innerHTML = `
<header class="flex-grow-0">
  <div class="container py-3">
    <object data="images/logo.svg" type="image/svg+xml" height="60"></object>
  </div>
</header>
`

export class AppHeader extends HTMLElement {
  constructor() {
    super();
    this.appendChild(template.content.cloneNode(true));
  }
}

customElements.define('app-header', AppHeader);