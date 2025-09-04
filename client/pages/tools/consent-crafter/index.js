import html from "solid-js/html";
import { Show, For, createResource, createEffect, createMemo, onMount, on } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
// import { trackStore } from "@solid-primitives/deep";
import { openDB } from "idb";
import { parseDocument } from "/utils/parsers.js";
import { readFile } from "/utils/files.js";
import { createReport } from "docx-templates";
import yaml from "yaml";
import { templateConfigs, getTemplateConfigsByCategory, getPrompt } from "./config.js";
import { alerts, clearAlert } from "/utils/alerts.js";
import { AlertContainer } from "/components/alert.js";
import Modal from "/components/modal.js";
import ClassToggle from "/components/class-toggle.js";

// ============= Database Layer =============

function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') {
    return 'anonymous';
  }
  return email
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');
}

async function getDatabase(userEmail) {
  const dbName = `arti-consent-crafter-${sanitizeEmail(userEmail)}`;
  
  return await openDB(dbName, 1, {
    upgrade(db) {
      const store = db.createObjectStore('sessions', { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      store.createIndex('createdAt', 'createdAt');
    }
  });
}

// Base64 conversion helpers
async function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type });
}

async function documentsToBase64(documents) {
  const result = {};
  for (const [id, doc] of Object.entries(documents)) {
    result[id] = doc.blob 
      ? { ...doc, content: await blobToBase64(doc.blob), blob: null }
      : doc;
  }
  return result;
}

function base64ToDocuments(documents) {
  const result = {};
  for (const [id, doc] of Object.entries(documents)) {
    result[id] = doc.content && doc.status === "completed"
      ? { ...doc, blob: base64ToBlob(doc.content) }
      : doc;
  }
  return result;
}

// ============= TreeSelect Component =============

function TreeSelect(props) {
  return html`
    <div class="border rounded p-2">
      <${For} each=${props.groups}>
        ${(group) => html`
          <div class="mb-2">
            <div class="fw-bold text-muted small">${() => group.label}</div>
            <${For} each=${() => group.options}>
              ${(option) => html`
                <div class="form-check form-control-sm min-height-auto py-0 ms-1">
                  <input
                    class="form-check-input cursor-pointer"
                    type="checkbox"
                    id=${() => option.value}
                    disabled=${() => option.disabled}
                    checked=${() => props.selected.includes(option.value)}
                    onChange=${(e) => {
                      const value = option.value;
                      const isChecked = e.target.checked;
                      props.onChange(value, isChecked);
                    }}
                  />
                  <label
                    class=${() =>
                      ["form-check-label cursor-pointer", option.disabled ? "text-muted" : ""].filter(Boolean).join(" ")}
                    for=${() => option.value}>
                    ${() => templateConfigs[option.value].label}
                  </label>
                </div>
              `}
            <//>
          </div>
        `}
      <//>
    </div>
  `;
}

// ============= FileInputWithDisplay Component =============

function FileInputWithDisplay(props) {
  const { filename, inputId, inputName, accept, onFileSelect, onClear } = props;
  
  return html`
    <${Show} when=${filename} fallback=${html`
      <input 
        type="file" 
        id=${inputId} 
        name=${inputName}
        class="form-control form-control-sm mb-3"
        accept=${accept} 
        onChange=${onFileSelect} 
      />
    `}>
      <div class="d-flex align-items-center gap-2 mb-3">
        <div class="form-control form-control-sm d-flex justify-content-between align-items-center">
          <span class="text-truncate" title=${filename}>${filename}</span>
          <button 
            type="button" 
            class="btn-close btn-close-sm" 
            aria-label="Clear file" 
            onClick=${onClear}
          ></button>
        </div>
      </div>
    <//>
  `;
}

// ============= Main Component =============

export default function Page() {
  // ============= Database Handle =============
  let db = null;

  // ============= Store & State =============
  const [store, setStore] = createStore({
    // Session
    id: null,
    
    // Input state
    inputText: "",
    inputTextFilename: "",
    
    // Template state  
    selectedTemplates: [],
    customTemplate: null, // ArrayBuffer for custom template
    customTemplateFilename: "",
    customSystemPrompt: "",
    
    // Advanced options (keep exact same UI)
    model: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    templateSourceType: "predefined",
    selectedPredefinedTemplate: "",
    advancedOptionsOpen: false,
    
    // Output state
    generatedDocuments: {},
    
    // UI state
    expandModalOpen: false
  });

  const [session] = createResource(() => fetch("/api/session").then((res) => res.json()));

  // ============= Session Persistence =============

  async function saveSession(createNew = false) {
    if (!db || !session()?.user?.email) return;
    
    const storeData = unwrap(store);
    const sessionData = {
      ...storeData,
      generatedDocuments: await documentsToBase64(storeData.generatedDocuments),
      customTemplate: storeData.customTemplate ? await blobToBase64(new Blob([storeData.customTemplate])) : null,
      createdAt: Date.now()
    };
    
    const id = createNew 
      ? await db.add('sessions', sessionData)
      : await db.put('sessions', sessionData);
    
    if (createNew) {
      setStore('id', id);
      const url = new URL(window.location);
      url.searchParams.set('id', id);
      window.history.replaceState(null, '', url);
    }
    
    return id;
  }

  async function loadSession(id) {
    if (!db) return;
    
    try {
      const sessionData = await db.get('sessions', parseInt(id));
      if (sessionData) {
        setStore({
          ...sessionData,
          generatedDocuments: base64ToDocuments(sessionData.generatedDocuments || {}),
          customTemplate: sessionData.customTemplate 
            ? await base64ToBlob(sessionData.customTemplate).arrayBuffer()
            : null
        });
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  }

  // Initialize database and load session on mount
  createEffect(async () => {
    const user = session()?.user;
    if (user?.email) {
      db = await getDatabase(user.email);
      
      // Load session from URL if present
      const sessionId = new URLSearchParams(window.location.search).get('id');
      if (sessionId) {
        await loadSession(sessionId);
        
        // Auto-restart any interrupted jobs (documents with "processing" status)
        const interruptedDocs = Object.entries(store.generatedDocuments)
          .filter(([id, doc]) => doc.status === "processing");

        for (const [templateId] of interruptedDocs) {
          retryTemplate(templateId);
        }
      }
    }
  });

  // ============= Computed Properties =============
  
  // Get template groups from config
  const templateGroups = () => getTemplateConfigsByCategory();

  // Check if all documents are done processing
  const allDocumentsProcessed = createMemo(() => {
    const docs = store.generatedDocuments;
    const docKeys = Object.keys(docs);
    if (docKeys.length === 0) return true;
    return docKeys.every(key => docs[key].status === "completed" || docs[key].status === "error");
  });

  // Check if Generate button should be disabled
  const isGenerateDisabled = createMemo(() => {
    // Always need input text
    if (!store.inputText) return true;
    
    // Check if we have either basic templates OR fully configured advanced options
    const hasBasicTemplates = store.selectedTemplates.length > 0;
    
    const hasValidAdvancedOptions = store.advancedOptionsOpen && (
      (store.templateSourceType === 'predefined' && store.selectedPredefinedTemplate && store.customSystemPrompt.trim()) ||
      (store.templateSourceType === 'custom' && store.customTemplate && store.customSystemPrompt.trim())
    );
    
    // Enable if we have either basic templates OR valid advanced options
    return !(hasBasicTemplates || hasValidAdvancedOptions);
  });

  // ============= Event Handlers =============
  
  // Load the predefined template's prompt when selected
  createEffect(async () => {
    const templateId = store.selectedPredefinedTemplate;
    if (templateId && store.templateSourceType === "predefined") {
      try {
        const prompt = await getPrompt(templateId);
        setStore('customSystemPrompt', prompt);
      } catch (error) {
        console.error("Failed to load template prompt:", error);
        setStore('customSystemPrompt', "");
      }
    }
  });

  // No auto-save - only save explicitly on submit and after document generation

  async function handleFileSelect(event) {
    const input = event.target;
    const name = input.name;
    const file = input.files?.[0];
    if (!file) return;
    const bytes = await readFile(file, "arrayBuffer");

    if (name === "outputTemplateFile") {
      setStore('customTemplate', bytes);
      setStore('customTemplateFilename', file.name);
    } else if (name === "inputTextFile") {
      setStore('inputText', "Reading file...");
      setStore('inputTextFilename', file.name);
      setStore('generatedDocuments', {});
      const text = await parseDocument(bytes, file.type, file.name);
      setStore('inputText', text);
    }
  }

  function handleTemplateSelectionChange(value, isChecked) {
    setStore('selectedTemplates', prev => 
      isChecked ? [...prev, value] : prev.filter(v => v !== value)
    );
  }

  // ============= Template Processing =============

  async function processSingleTemplate(templateId, text) {
    // Set status to processing
    setStore('generatedDocuments', templateId, { 
      status: "processing", 
      blob: null, 
      content: null,
      error: null 
    });

    // Save state immediately after setting processing status
    await saveSession(false);

    try {
      let templateFile, systemPrompt, defaultOutputData;

      if (templateId === "custom") {
        // Handle custom template
        systemPrompt = store.customSystemPrompt;
        defaultOutputData = templateConfigs["nih-cc-adult-healthy"].defaultOutput; // Use NIH consent output structure for custom
        templateFile = store.customTemplate;
      } else if (templateId === "predefined-custom") {
        // Handle predefined template with optional custom prompt
        const config = templateConfigs[store.selectedPredefinedTemplate];
        systemPrompt = store.customSystemPrompt.trim() || (await getPrompt(store.selectedPredefinedTemplate));
        defaultOutputData = config.defaultOutput;
        templateFile = await fetch(config.templateUrl).then((res) => res.arrayBuffer());
      } else {
        // Handle predefined templates
        const config = templateConfigs[templateId];
        systemPrompt = await getPrompt(templateId);
        defaultOutputData = config.defaultOutput;
        templateFile = await fetch(config.templateUrl).then((res) => res.arrayBuffer());
      }

      const system = "Please process the ENTIRE document according to your instructions and your role: <document>{{document}}</document>. The document may be quite lengthy, so take your time. After reading the document and user instructions, provide your response below, without preamble. Begin your detailed extraction and JSON generation as soon as you receive further instructions from the user.";

      // Extract data using AI
      const params = {
        model: store.model,
        messages: [{ role: "user", content: [{ text: systemPrompt.replace("{{document}}", "see above") }] }],
        system: system.replace("{{document}}", text),
        stream: false,
      };
      const output = await runModel(params);
      const jsonOutput = output.match(/```json\s*([\s\S]*?)\s*```/)?.[1] || 
        output.match(/{\s*[\s\S]*?}/)?.[0] || "{}";

      const data = { ...defaultOutputData, ...yaml.parse(jsonOutput) };

      // Generate document
      const type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const cmdDelimiter = ["{{", "}}"];
      const buffer = await createReport({ template: templateFile, data, cmdDelimiter });
      const blob = new Blob([buffer], { type });

      // Update status to completed
      setStore('generatedDocuments', templateId, { 
        status: "completed", 
        blob, 
        content: await blobToBase64(blob),
        error: null 
      });
    } catch (error) {
      console.error(`Error processing ${templateId}:`, error);
      setStore('generatedDocuments', templateId, { 
        status: "error", 
        blob: null, 
        content: null,
        error: error.message 
      });
    } finally {
      // Update session after processing completes
      await saveSession(false);
    }
  }

  async function retryTemplate(templateId) {
    const text = store.inputText;
    if (!text) {
      console.error('No input text available for retry');
      return;
    }
    await processSingleTemplate(templateId, text);
  }
  
  async function processSelectedTemplates(text) {
    const selected = store.selectedTemplates;

    // Build list of templates to process (selected + custom if available)
    const templatesToProcess = [...selected];

    // Add custom template if in custom mode with template and prompt
    if (store.templateSourceType === "custom" && store.customTemplate && store.customSystemPrompt.trim()) {
      templatesToProcess.push("custom");
    }

    // Add predefined template if in predefined mode with valid selection
    if (store.templateSourceType === "predefined" && store.selectedPredefinedTemplate) {
      templatesToProcess.push("predefined-custom");
    }

    if (templatesToProcess.length === 0) return;

    // Initialize processing status for each template
    const initialStatus = {};
    templatesToProcess.forEach((templateId) => {
      initialStatus[templateId] = { status: "processing", blob: null, content: null, error: null };
    });
    setStore('generatedDocuments', initialStatus);

    // Save state immediately after setting initial processing status
    await saveSession(false);

    // Process all templates in parallel
    for (const templateId of templatesToProcess) {
      processSingleTemplate(templateId, text);
    }
  }

  // ============= Utility Functions =============
  
  function formatDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
  }

  function downloadDocument(templateId) {
    const doc = store.generatedDocuments[templateId];
    if (!doc?.blob) return;
    const timestamp = formatDate(new Date());

    let filename;
    if (templateId === "custom") {
      filename = `custom-document-${timestamp}.docx`;
    } else if (templateId === "predefined-custom") {
      const config = templateConfigs[store.selectedPredefinedTemplate];
      filename = config.filename.replace(".docx", `-${timestamp}.docx`);
    } else {
      const config = templateConfigs[templateId];
      filename = config.filename.replace(".docx", `-${timestamp}.docx`);
    }

    const url = URL.createObjectURL(doc.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadAll() {
    const docs = store.generatedDocuments;
    Object.keys(docs).forEach((templateId) => {
      if (docs[templateId].status === "completed") {
        downloadDocument(templateId);
      }
    });
  }

  async function handleSubmit(event) {
    event?.preventDefault();
    const text = store.inputText;
    if (!text) return;
    
    // Check if we have either basic templates OR fully configured advanced options
    const hasBasicTemplates = store.selectedTemplates.length > 0;
    const hasValidAdvancedOptions = store.advancedOptionsOpen && (
      (store.templateSourceType === 'predefined' && store.selectedPredefinedTemplate && store.customSystemPrompt.trim()) ||
      (store.templateSourceType === 'custom' && store.customTemplate && store.customSystemPrompt.trim())
    );
    
    if (!(hasBasicTemplates || hasValidAdvancedOptions)) return;
    
    // Create a new session on submit
    setStore('id', undefined);
    await saveSession(true);
    await processSelectedTemplates(text);
  }

  async function handleReset(event) {
    event?.preventDefault();
    const form = event?.target;
    form.inputTextFile.value = "";
    if (form.outputTemplateFile) {
      form.outputTemplateFile.value = "";
    }

    // Clear all state
    setStore({
      id: null,
      inputText: "",
      inputTextFilename: "",
      customTemplate: null,
      customTemplateFilename: "",
      selectedTemplates: [],
      generatedDocuments: {},
      selectedPredefinedTemplate: "",
      templateSourceType: "predefined",
      model: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
      customSystemPrompt: "",
    });
    
    // Clear URL parameter
    const url = new URL(window.location);
    url.searchParams.delete('id');
    window.history.replaceState(null, '', url);
  }

  /**
   * Runs an AI model with the given parameters and returns the output text.
   * @param {any} params
   * @returns {Promise<string>} The output text from the model
   */
  async function runModel(params) {
    const response = await fetch("/api/model", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();
    return data?.output?.message?.content?.[0]?.text || "";
  }

  // ============= UI Component =============
  
  return html`
    <div class="bg-info-subtle h-100 position-relative">
      <${AlertContainer} alerts=${alerts} onDismiss=${clearAlert} />
      <div class="container py-3">
        <form onSubmit=${handleSubmit} onReset=${handleReset}>
          <div class="row align-items-stretch">
            <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
              <div class="bg-white shadow rounded p-3">
                <label for="inputText" class="form-label text-info fs-5 mb-1">Source Document<span class="text-danger">*</span></label>
                <${FileInputWithDisplay}
                  filename=${() => store.inputTextFilename}
                  inputId="inputTextFile"
                  inputName="inputTextFile"
                  accept=".txt, .docx, .pdf"
                  onFileSelect=${handleFileSelect}
                  onClear=${() => {
                    setStore('inputTextFilename', '');
                    setStore('inputText', '');
                    setStore('generatedDocuments', {});
                  }}
                />

                <!-- Template Selection -->
                <div class="mb-3">
                  <label class="form-label text-info fs-5 mb-1">Form Templates<span class="text-danger">*</span></label>
                  <${TreeSelect} 
                    groups=${templateGroups}
                    selected=${() => store.selectedTemplates}
                    onChange=${handleTemplateSelectionChange}
                  />
                </div>

                <div class="d-flex flex-wrap justify-content-between align-items-center">
                  <${Show} when=${() => [1, 2].includes(session()?.user?.Role?.id)}>
                    <details class="small text-secondary mt-2" open=${() => store.advancedOptionsOpen} onToggle=${(e) => setStore('advancedOptionsOpen', e.target.open)}>
                      <summary class="form-label text-info fs-5 mb-1">Advanced Options</summary>
                      <div class="border rounded p-2">
                        <label for="model" class="form-label">Model</label>
                        <select
                          class="form-select form-select-sm cursor-pointer mb-2"
                          name="model"
                          id="model"
                          value=${() => store.model}
                          onChange=${(e) => setStore('model', e.target.value)}>
                          <option value="us.anthropic.claude-opus-4-1-20250805-v1:0">Opus 4.1</option>
                          <option value="us.anthropic.claude-sonnet-4-20250514-v1:0">Sonnet 4.0</option>
                          <option value="us.anthropic.claude-3-7-sonnet-20250219-v1:0">Sonnet 3.7</option>
                          <option value="us.anthropic.claude-3-5-haiku-20241022-v1:0">Haiku 3.5</option>
                          <option value="us.meta.llama4-maverick-17b-instruct-v1:0">Maverick</option>
                        </select>

                        <div class="d-flex justify-content-between">
                          <label class="form-label">Form Template</label>
                          <div>
                            <div class="form-check form-check-inline">
                              <input
                                class="form-check-input"
                                type="radio"
                                name="templateSource"
                                id="templateSourcePredefined"
                                value="predefined"
                                checked=${() => store.templateSourceType === "predefined"}
                                onChange=${(e) => setStore('templateSourceType', e.target.value)} />
                              <label class="form-check-label" for="templateSourcePredefined"> Predefined template </label>
                            </div>
                            <div class="form-check form-check-inline">
                              <input
                                class="form-check-input"
                                type="radio"
                                name="templateSource"
                                id="templateSourceCustom"
                                value="custom"
                                checked=${() => store.templateSourceType === "custom"}
                                onChange=${(e) => setStore('templateSourceType', e.target.value)} />
                              <label class="form-check-label" for="templateSourceCustom"> Custom template </label>
                            </div>
                          </div>
                        </div>

                        <${Show} when=${() => store.templateSourceType === "predefined"}>
                          <div class="input-group mb-2">
                            <select
                              class="form-select form-select-sm cursor-pointer"
                              name="predefinedTemplate"
                              id="predefinedTemplate"
                              value=${() => store.selectedPredefinedTemplate}
                              onChange=${(e) => setStore('selectedPredefinedTemplate', e.target.value)}>
                              <option value="">[No Template]</option>
                              <${For} each=${templateGroups}>
                                ${(group) => html`
                                  <optgroup label=${() => group.label}>
                                    <${For} each=${() => group.options}>
                                      ${(option) => html`
                                        <option value=${() => option.value} disabled=${() => option.disabled}>
                                          ${() => `${templateConfigs[option.value].prefix} - ${templateConfigs[option.value].label}`}
                                        </option>
                                      `}
                                    <//>
                                  </optgroup>
                                `}
                              <//>
                            </select>
                          </div>
                        <//>

                        <${Show} when=${() => store.templateSourceType === "custom"}>
                          <${FileInputWithDisplay}
                            filename=${() => store.customTemplateFilename}
                            inputId="outputTemplateFile"
                            inputName="outputTemplateFile"
                            accept=".txt, .docx, .pdf"
                            onFileSelect=${handleFileSelect}
                            onClear=${() => {
                              setStore('customTemplateFilename', '');
                              setStore('customTemplate', null);
                            }}
                          />

                          <div class="position-relative">
                            <${ClassToggle} activeClass="show">
                              <label
                                class="form-label"
                                toggle>
                                Custom Prompt${() => store.advancedOptionsOpen && store.customTemplate ? html`<span class="text-danger">*</span>` : ''} <img src="/assets/images/icon-circle-info.svg" alt="Info" />
                              </label>
                              <div class="clickover">
                                Use this field to provide your own instructions for generating a form. The system will follow your prompt instead of a predefined template.
                              </div>
                            <//>
                          </div>
                          <div class="position-relative">
                            <textarea
                              class="form-control form-control-sm rounded-top-0 flex-grow-1"
                              id="systemPromptCustom"
                              name="systemPromptCustom"
                              rows="10"
                              style="resize: none; padding-right: 20px;"
                              placeholder="Enter a custom prompt to generate your form."
                              value=${() => store.customSystemPrompt}
                              onInput=${(e) => setStore('customSystemPrompt', e.target.value)} />
                            <button
                              type="button"
                              class="position-absolute d-flex align-items-center justify-content-center"
                              style="bottom: 4px; right: 4px; width: 20px; height: 20px; padding: 0; border: none; background: transparent;"
                              title="Expand Custom Prompt"
                              onClick=${() => setStore('expandModalOpen', true)}>
                              <img src="/assets/images/icon-expand.svg" alt="Expand" height="12" />
                            </button>
                          </div>
                        <//>

                        <${Show} when=${() => store.templateSourceType === "predefined"}>
                          <div class="position-relative">
                            <${ClassToggle} activeClass="show">
                              <label
                                class="form-label"
                                toggle>
                                Custom Prompt${() => store.advancedOptionsOpen && store.selectedPredefinedTemplate ? html`<span class="text-danger">*</span>` : ''} <img src="/assets/images/icon-circle-info.svg" alt="Info" />
                              </label>
                              <div class="clickover">
                                Use this field to provide your own instructions for generating a form. The system will follow your prompt instead of a predefined template.
                              </div>
                            <//>
                          </div>
                          <div class="position-relative">
                            <textarea
                              class="form-control form-control-sm rounded-top-0 flex-grow-1"
                              id="systemPromptPredefined"
                              name="systemPromptPredefined"
                              rows="10"
                              style="resize: none; padding-right: 20px;"
                              placeholder="Enter a custom prompt to generate your form."
                              value=${() => store.customSystemPrompt}
                              onInput=${(e) => setStore('customSystemPrompt', e.target.value)} />
                            <button
                              type="button"
                              class="position-absolute d-flex align-items-center justify-content-center"
                              style="bottom: 4px; right: 4px; width: 20px; height: 20px; padding: 0; border: none; background: transparent;"
                              title="Expand Custom Prompt"
                              onClick=${() => setStore('expandModalOpen', true)}>
                              <img src="/assets/images/icon-expand.svg" alt="Expand" height="12" />
                            </button>
                          </div>
                        <//>
                      </div>
                    </details>
                  <//>
                </div>
              </div>
            </div>
            <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
              <div class="d-flex flex-column bg-white shadow border rounded p-3 flex-grow-1">
                <${Show}
                  when=${() => Object.keys(store.generatedDocuments).length > 0}
                  fallback=${html`<div class="d-flex h-100 py-5">
                    <div class="text-center py-5">
                      <h1 class="text-info mb-3">Welcome to Consent Crafter</h1>
                      <div>
                        To get started, upload your source document, select one or more form templates from the list, and click Generate to
                        create tailored consent documents.
                      </div>
                    </div>
                  </div>`}>
                  <div class="d-flex flex-column gap-2">
                    <div class="text-muted small fw-semibold">
                      <${Show} when=${allDocumentsProcessed} fallback="We are generating your forms now. This may take a few moments.">
                        All processing is complete. The generated forms are available for download.
                      <//>
                    </div>

                    <${For} each=${() => Object.keys(store.generatedDocuments)}>
                      ${(templateId) => {
                        const doc = () => store.generatedDocuments[templateId];
                        const documentInfo = () => {
                          if (templateId === "custom") {
                            return { prefix: "Custom Document", label: "", filename: "custom-document.docx" };
                          } else if (templateId === "predefined-custom") {
                            const config = templateConfigs[store.selectedPredefinedTemplate];
                            return {
                              prefix: config.prefix || "",
                              label: config.label + " (Custom)",
                              filename: config.filename.replace(".docx", "-custom.docx"),
                            };
                          } else {
                            const config = templateConfigs[templateId];
                            return { prefix: config.prefix || "", label: config.label, filename: config.filename };
                          }
                        };

                        return html`
                          <div class="d-flex justify-content-between align-items-center p-2 border rounded">
                            <div class="flex-grow-1">
                              <div class="fw-medium">
                                <span>${() => documentInfo().prefix}</span>
                                <span class="text-muted fw-normal"> : ${() => documentInfo().label}</span>
                              </div>
                              <div class="small text-muted">${() => documentInfo().filename}</div>
                            </div>
                            <${Show} when=${() => doc()?.status === "processing"}>
                              <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                                <span class="visually-hidden">Processing...</span>
                              </div>
                            <//>
                            <${Show} when=${() => doc()?.status === "completed"}>
                              <button type="button" class="btn btn-outline-light" onClick=${() => downloadDocument(templateId)}>
                                <img src="/assets/images/icon-download.svg" height="16" alt="Download" />
                              </button>
                            <//>
                            <${Show} when=${() => doc()?.status === "error"}>
                              <div class="d-flex align-items-center gap-2">
                                <button type="button" class="btn btn-sm btn-outline-danger"  title=${() => doc().error} 
                                  onClick=${() => retryTemplate(templateId)}>
                                  Retry
                                </button>
                              </div>
                            <//>
                          </div>
                        `;
                      }}
                    <//>
                  </div>
                  <${Show} when=${allDocumentsProcessed}>
                    <div class="h-100 d-flex flex-column justify-content-between">
                      <div class="text-end">
                        <button type="button" class="btn btn-sm btn-link fw-semibold p-0" onClick=${downloadAll}>Download All</button>
                      </div>
                      <div class="mt-auto d-flex align-items-center">
                        <img src="/assets/images/icon-star.svg" alt="Star" class="me-2" height="16" />
                        <div>
                          <span class="me-1">We would love your feedback!</span>
                          <a href="https://www.cancer.gov/" target="_blank">Take a quick survey</a> to help us improve.
                        </div>
                      </div>
                    </div>
                  <//>
                <//>
              </div>
            </div>
          </div>
          <div class="row">
            <div class="col-md-6">
              <div class="d-flex-center mt-1 gap-1">
                <button type="reset" class="btn btn-light border rounded-pill">Reset</button>
                <${ClassToggle} class="position-relative" activeClass="show" event="hover">
                  <button
                    toggle
                    type="submit"
                    class="btn btn-primary rounded-pill"
                    disabled=${() => isGenerateDisabled() || !allDocumentsProcessed()}>
                    Generate
                  </button>
                  <${Show} when=${() => isGenerateDisabled()}>
                    <div class="tooltip-top">
                      Not all required fields are provided. 
                    </div>
                  <//>
                <//>
              </div>
            </div>
          </div>
        </form>
      </div>
      
      <${Modal}
        open=${() => store.expandModalOpen}
        setOpen=${(open) => setStore('expandModalOpen', open)}
        dialogClass=${{"modal-xl": true}}
        bodyClass=${{"px-4": true}}
        children=${html`
          <div class="p-3">
            <textarea
              class="form-control form-control-sm mb-3"
              rows="25"
              style="resize: none;"
              placeholder="Enter a custom prompt to generate your form."
              value=${() => store.customSystemPrompt}
              onInput=${(e) => setStore('customSystemPrompt', e.target.value)}
            />
            <div class="d-flex justify-content-end">
              <button
                type="button"
                class="btn btn-light border rounded-pill"
                onClick=${() => setStore('expandModalOpen', false)}>
                Close
              </button>
            </div>
          </div>
        `}
      />
    </div>
  `;
}