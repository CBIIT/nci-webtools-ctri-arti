import html from "solid-js/html";
import InputForm from "./input-form.js";
import { newWorkspace } from "./options.js";

export default function Workspaces({ workspaces, setWorkspaces, selectedWorkspace, setSelectedWorkspace }) {
  function setWorkspaceKey(workspaceIndex, key, value) {
    setWorkspaces((workspace) => {
      let clone = structuredClone(workspaces);
      clone[workspaceIndex][key] = value;
      return clone;
    });
  }

  function addWorkspace() {
    setWorkspaces((workspaces) => {
      const workspace = structuredClone({
        ...newWorkspace,
        id: workspaces.length + 1,
      });
      return workspaces.concat(workspace);
    });
  }

  function removeWorkspace(workspaceIndex) {
    setWorkspaces((workspaces) => {
      let clone = structuredClone(workspaces);
      clone.splice(workspaceIndex, 1);
      return clone;
    });
  }

  function addResults(workspaceIndex, results) {
    setWorkspaces((workspaces) => {
      const clone = structuredClone(workspaces);
      for (const result of results) {
        const resultIndex = clone[workspaceIndex].results.findIndex((r) => r.id === result.id);
        if (resultIndex !== -1) {
          clone[workspaceIndex].results[resultIndex] = result;
        } else {
          clone[workspaceIndex].results.push(result);
        }
      }

      return clone;
    });
  }

  const isSelected = (workspaceIndex) => selectedWorkspace === workspaceIndex;
  const workspace = workspaces[selectedWorkspace];

  if (!workspace) return null;

  return html`
    <div class="">
      <${InputForm}
        workspace=${workspace}
        onChange=${(ev) => setWorkspaceKey(selectedWorkspace, ev.target.name, ev.target.value)}
        onResults=${(results) => addResults(selectedWorkspace, results)}
        index=${selectedWorkspace} />
      ${false && workspaces.map(
        (workspace, index) => html`
          <div
            class=${"position-relative border-bottom " + (!isSelected(index) && "opacity-50")}
            key=${`workspace-${index}`}>
            <div
              class=${"p-3 cursor-pointer d-flex align-items-center justify-content-between " +
              (isSelected(index) && "border-bottom")}
              onClick=${() => setSelectedWorkspace(index)}>
              <div>
                ${isSelected(index)
                  ? html`<i class="bi bi-caret-down-fill  me-1"></i>`
                  : html`<i class="bi bi-caret-right-fill me-1"></i>`}
                <input
                  value=${workspace.title}
                  onInput=${(ev) => setWorkspaceKey(index, "title", ev.target.value)}
                  class="bg-transparent border-0 border-bottom fw-semibold" />
                <i class="bi bi-pencil-fill opacity-50"></i>
              </div>
              <button
                class="btn-close"
                onClick=${() =>
                  confirm("Please confirm you wish to remove this workspace") && removeWorkspace(index)}></button>
            </div>
            ${isSelected(index) &&
            html`
              <div class="p-3">
                <${InputForm}
                  workspace=${workspace}
                  onChange=${(ev) => setWorkspaceKey(index, ev.target.name, ev.target.value)}
                  onResults=${(results) => addResults(index, results)}
                  index=${index} />
              </div>
            `}
          </div>
        `
      )}
    </div>
  `;
}
