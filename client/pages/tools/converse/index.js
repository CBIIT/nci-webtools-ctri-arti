import { createSignal, Show } from 'solid-js';
import html from 'solid-js/html';

import Float, { Tooltip, Popover, Dropdown } from '../../../components/float.js';

export default function Page(props) {
  const [sidebarOpen, setSidebarOpen] = createSignal(false);

  return html`
    <div class="container-fluid min-vh-100 bg-light">
      <div class="row h-100">
        <div 
          class="col-sm-auto h-100 border-end position-absolute position-md-relative py-2" 
          style="max-width: 100%;"
          classList=${() => ({ "w-20r": sidebarOpen() })}>

          <div class="d-flex align-items-center mb-2">
            <button class="btn btn-light btn-sm" type="button" onClick=${() => setSidebarOpen(open => !open)}>
              <i class="bi bi-layout-sidebar"></i>
            </button>
            <${Show} when=${sidebarOpen}>
              <small class="ms-2 fw-semibold">Menu</small>
            <//>
          </div>

          <div class="d-flex align-items-center mb-2">
            <a class="btn btn-sm btn-outline-secondary" href="/tools/converse" target="_self">
              <i class="bi bi-plus-lg"></i>
            </button>
            <${Show} when=${sidebarOpen}>
              <${Dropdown} content=${['a', 'b', 'c'].map(el => html`
                  <div class="dropdown-item">${el}</div>
                `)}>
                <small class="ms-2 fw-semibold">New Chat</small>
              <//>
            <//>
          </div>

          <${Show} when=${sidebarOpen}>
            <div class="mt-4">
              <small class="mb-2">Recent Chats</small>
              <div class="text-secondary">No recent chats</div>
            </div>
          <//>

        </div>
        <div class="col h-100">
          <div class="d-flex flex-column mx-auto h-100" style="width: 42rem; max-width: 100%;">
            <h1 class="py-5 mt-5 display-6 text-center">Welcome!</h1>
            <form class="bg-white w-100 p-2 mb-5 rounded shadow-sm">
              <textarea class="form-control-sm px-1 border-0 w-100 outline-0" rows="3" placeholder="How can I help you today?"></textarea>
              <div class="w-100 d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center">
                  <label class="btn btn-sm btn-light">
                    <input
                      type="file"
                      id="inputFiles"
                      name="inputFiles"
                      aria-label="Input files"
                      class="visually-hidden"
                      accept="image/*,text/*,.pdf,.xls,.xlsx,.doc,.docx"
                      multiple
                    />
                    <i class="bi bi-plus-lg"></i>
                  </label>
                  <${Popover} trigger="click" title="hey" content="Enable this mode for more thorough responses to complex problems. Please note this requires additional time and resources.">
                    <div class="form-check form-switch form-control-sm my-0 mx-2">
                      <input
                        class="form-check-input p-0 cursor-pointer"
                        type="checkbox"
                        id="reasoningMode"
                        name="reasoningMode"
                      />
                      <label
                        toggle
                        class="form-check-label text-secondary cursor-pointer"
                        for="reasoningMode"
                      >
                        Extended Reasoning
                      </label>
                    </div>
                  <//>
                </div>

                <div class="d-flex">
                  <select
                    class="form-select form-select-sm  text-secondary border-0 shadow-0  bg-transparent cursor-pointer"
                    name="model"
                    id="model"
                    required
                  >
                    <option value="us.anthropic.claude-opus-4-1-20250805-v1:0">
                      Opus 4.5
                    </option>
                    <option value="us.anthropic.claude-sonnet-4-5-20250929-v1:0" selected>
                      Sonnet 4.5
                    </option>
                    <option value="us.anthropic.claude-3-5-haiku-20241022-v1:0">
                      Haiku 3.5
                    </option>
                  </select>
                  <button class="btn btn-sm btn-secondary" type="submit">
                    <i class="bi bi-arrow-up"></i>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  
  
  `;
}