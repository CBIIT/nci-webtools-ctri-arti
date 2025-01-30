import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import htm from "htm";
import { downloadTextFile, openWindow } from "../utils.js";
import { getInferenceCost, getModelLabel } from "./options.js";

const html = htm.bind(h);

export default function Results({ selectedWorkspace, workspaces, setWorkspaces }) {
  const workspace = workspaces[selectedWorkspace];
  
  function removeWorkspaceResult(workspaceIndex, resultIndex) {
    setWorkspaces((workspaces) => {
      let clone = [...workspaces];
      clone[workspaceIndex].results.splice(resultIndex, 1);
      return clone
    });
  }

  return html`
    <div class="mb-3">
      <div class="table-responsive">
        <table class="table table-hover  align-middle">
          <thead>
            <tr>
              <th>Document</th>
              <th>Model</th>
              <th>Status</th>
              <th>Tokens</th>
              <th  hidden>Est. Cost</th>
              <th>Duration</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody class="table-group-divider">
            ${workspace.results?.map(
              (result, index) => html`
                <tr key=${`result-${index}`}>
                  <td>${result?.document} <small>${result?.id}</small></td>
                  <td>${getModelLabel(result?.modelId)}</td>
                  <td>${result?.status}${result?.error && html`<small class="ms-1">(${result?.error})</small>`}</td>
                  <td>${result?.results?.usage?.totalTokens && `${(result?.results?.usage?.totalTokens / 1000).toFixed(2)}k`}</td>
                  <td hidden>${result?.results?.usage ? getInferenceCost(result?.modelId, result?.results?.usage?.inputTokens / 1000, result?.results?.usage?.outputTokens / 1000).toPrecision(4) : 'N/A'}</td>
                  <td>${result?.duration && `${(result.duration / 1000).toFixed(2)}s`}</td>
                  <td>
                    ${result?.status === "Succeeded" &&
                    html`
                      <button
                        class="btn btn-sm btn-outline-primary me-1"
                        onClick=${(ev) =>
                          downloadTextFile(
                            `${result?.document}-results.txt`,
                            result?.results.output.message.content?.[0]?.text
                          )}>
                        Download Results
                      </button>
                      <button
                        class="btn btn-sm btn-outline-primary me-1"
                        onClick=${(ev) =>
                          openWindow(result?.document, result?.results.output.message.content?.[0]?.text)}>
                        View Results
                      </button>
                      <button
                        class="btn btn-sm btn-outline-primary me-1"
                        onClick=${(ev) => openWindow(result?.document, result?.prompt + "\n" + result?.text)}>
                        View Prompt
                      </button>
                    `}
                    <button class="btn btn-sm btn-outline-danger me-1" onClick=${() => confirm("Please confirm you wish to remove this entry") && removeWorkspaceResult(selectedWorkspace, index)}>Delete</button>
                  </td>
                </tr>
              `
            )}
          </tbody>
        </table>
      </div>
    </div>
    <pre hidden>${JSON.stringify(workspace, null, 2)}</pre>
  `;
}
