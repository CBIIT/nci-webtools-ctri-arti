import html from "solid-js/html";

export default function Page() {
  const links = [
    
    {
      title: "Chat",
      description: "Intelligent general-purpose assistant",
      href: "/tools/chat",
      icon: html`<img src="/assets/images/icon-assistant.svg" class="mt-2 mb-4 text-primary" height="60" alt="Chat Icon" />`,
    },
    {
      title: "Translator",
      description: "Translate documents and text",
      href: "/tools/translate",
      icon: html`<img src="/assets/images/icon-translate.svg" class="mt-2 mb-4 text-primary" height="60" alt="Translator Icon" />`,
    },
    {
      title: "Workspaces",
      description: "Manage document workspaces",
      href: "/tools/workspaces",
      icon: html`<img src="/assets/images/icon-books.svg" class="mt-2 mb-4 text-secondary" height="60" alt="Workspaces Icon" />`,
    }
  ]

  return html`
    <div class="container">
      <div class="row">
        <div class="col">
          <h1 class="fw-bold text-gradient my-3">Tools</h1>

          <div class="row">
          ${links.map(
            (link) => html`
              <div class="col-md-4 mb-4">
                <a
                  class="p-3 shadow-sm rounded text-center bg-light-opacity d-flex-center flex-column border-0 shadow-hover text-decoration-none h-100"
                  href="${link.href}">
                  <div class="text-danger">${link.icon}</div>
                  <h5 class="card-title mb-3 text-primary font-title">${link.title}</h5>
                  <p class="card-text text-secondary flex-grow-1">${link.description}</p>
                </a>
              </div>
            `
          )}
      </div>
        </div>
      </div>
    </div>
  `;
}