import html from "solid-js/html";
import { createEffect, createSignal } from "solid-js";
import Workspaces from "./workspaces.js";
import Results from "./results.js";
import { defaultWorkspaces, newWorkspace } from "./options.js";
import { loadFromStorage, pluralizeCount } from "./utils.js";

const initialWorkspaces = loadFromStorage("workspaces") || defaultWorkspaces;


export default function Page() {
  return html`
    <div class="container">
      <div class="row">
        <div class="col">
          <h1 class="fw-bold text-gradient my-3">Workspaces</h1>
          <p class="mb-2 fw-semibold text-danger">Under construction.</p>
        </div>
      </div>
    </div>
  `;
}

export function App() {
  const [workspaces, setWorkspaces] = createSignal(initialWorkspaces);
  const [selectedWorkspace, setSelectedWorkspace] = createSignal(-1);
  createEffect(() => {
    localStorage.setItem("workspaces", JSON.stringify(workspaces));
  }, [workspaces]);

  function setWorkspaceKey(workspaceIndex, key, value) {
    if (workspaceIndex < 0) return;
    setWorkspaces((prevWorkspaces) => {
      let clone = structuredClone(prevWorkspaces);
      clone[workspaceIndex][key] = value;
      return clone;
    });
  }

  function addWorkspace() {
    setWorkspaces((prevWorkspaces) => {
      const workspace = structuredClone({
        ...newWorkspace,
        id: prevWorkspaces.length + 1,
      });
      return prevWorkspaces.concat(workspace);
    });
  }

  function removeWorkspace(workspaceIndex) {
    setWorkspaces((prevWorkspaces) => {
      let clone = structuredClone(prevWorkspaces);
      clone.splice(workspaceIndex, 1);
      return clone;
    });
  }

  return html`
    <>

    <h1 class="h3 my-3 d-flex justify-content-between text-primary">
      ${(selectedWorkspace >= 0 &&
        html`<input
          value=${workspaces?.[selectedWorkspace]?.title}
          class="border-0 fw-semibold p-0 m-0"
          onInput=${(ev) => setWorkspaceKey(selectedWorkspace, "title", ev.target.value)}
          value=${workspaces?.[selectedWorkspace]?.title} />`) ||
      "Document Workspaces"}

      <div class="">
        ${selectedWorkspace >= 0 &&
        html`
          <button
            class="btn btn-sm btn-outline-danger"
            onClick=${() => {
              if (confirm("Please confirm you wish to delete this workspace")) {
                setSelectedWorkspace(-1);
                removeWorkspace(selectedWorkspace);
              }
            }}>
            <i class="bi bi-x-lg me-1"></i>
            Delete Workspace
          </button>

          <button type="button" class="btn btn-sm btn-outline-primary ms-1" onClick=${() => setSelectedWorkspace(-1)}>
            <i class="bi bi-arrow-left me-1"></i>
            Return to Workspace Selection
          </button>
        `}
      </div>
    </h1>

    ${selectedWorkspace === -1 &&
    html`
      <div class="row">
        ${workspaces.map(
          (workspace, index) =>
            html`<div class="col-md-3">
              <div class="h-100 py-2">
                <div
                  class="card cursor-pointer shadow-hover h-100"
                  style="border-left: 4px solid steelblue"
                  onClick=${() => setSelectedWorkspace(index)}>
                  <div class="card-body">
                    <div class="card-title">
                      <h2 class="h6 text-center text-primary">${workspace?.title}</h2>
                    </div>
                    <div class="card-text text-center">
                      <div class="small text-muted">${pluralizeCount(workspace?.results?.length || 0, "Document")}</div>
                      <div class="small text-muted">
                        ${pluralizeCount(
                          (
                            workspace?.results?.map((result) => result?.results?.usage?.totalTokens || 0).reduce((a, b) => a + b, 0) / 1e3
                          ).toPrecision(2),
                          "Kilotoken"
                        )}
                        <span class="ms-1"
                          >(${(
                            workspace?.results?.map((result) => result?.results?.usage?.totalTokens || 0).reduce((a, b) => a + b, 0) / 1e4
                          ).toPrecision(2)}%)</span
                        >
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>`
        )}
        <div class="col-md-3">
          <div class="h-100 py-2">
            <div class="card cursor-pointer shadow-hover h-100" style="border-left: 4px solid steelblue" onClick=${addWorkspace}>
              <div class="card-body d-flex align-items-center justify-content-center">
                <div class="card-title">
                  <h2 class="h6 text-center text-primary">+ Add Workspace</h2>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <h1 class="h3 my-3 d-flex justify-content-between text-primary">Developer Tools</h1>
      <div class="row">
        <div class="col-md-3">
          <a
            href="/agents/chat"
            class="card cursor-pointer shadow-hover mb-4 text-decoration-none"
            style="border-left: 4px solid steelblue;">
            <div class="card-body">
              <div class="card-title">
                <h2 class="h6 text-center text-primary">Chat</h2>
              </div>
              <div class="card-text text-center">
                <div class="small text-muted fw-normal">Intelligent Assistance</div>
              </div>
            </div>
          </a>
        </div>
      </div>
    `}

    <div class="row">
      ${selectedWorkspace >= 0 &&
      html`<${Workspaces}
        workspaces=${workspaces}
        setWorkspaces=${setWorkspaces}
        selectedWorkspace=${selectedWorkspace}
        setSelectedWorkspace=${setSelectedWorkspace} />`}
      ${selectedWorkspace >= 0 &&
      html`<${Results} selectedWorkspace=${selectedWorkspace} workspaces=${workspaces} setWorkspaces=${setWorkspaces} />`}
    </div>
  `;
}
