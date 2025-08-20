import html from "solid-js/html";
import { Show, For, createSignal, createResource, createEffect, createMemo } from "solid-js";
import { parseDocument } from "/utils/parsers.js";
import { readFile } from "/utils/files.js";
import { createReport } from "docx-templates";
import yaml from "yaml";
import { templateConfigs, getTemplateConfigsByCategory, getPrompt } from "./config.js";
import { alerts, showAlert, clearAlert } from "/utils/alerts.js";
import { AlertContainer } from "/components/alert.js";
import Modal from "/components/modal.js";

export default function Page() {
  const [inputText, setInputText] = createSignal("");
  const [outputText, setOutputText] = createSignal("");
  const [model, setModel] = createSignal("us.anthropic.claude-3-7-sonnet-20250219-v1:0");
  const [customSystemPrompt, setCustomSystemPrompt] = createSignal("");
  const [customTemplate, setCustomTemplate] = createSignal();
  const [selectedTemplates, setSelectedTemplates] = createSignal([]);
  const [generatedDocuments, setGeneratedDocuments] = createSignal({});
  const [templateSourceType, setTemplateSourceType] = createSignal("predefined");
  const [selectedPredefinedTemplate, setSelectedPredefinedTemplate] = createSignal("");
  const [expandModalOpen, setExpandModalOpen] = createSignal(false);
  const [customPromptTooltipOpen, setCustomPromptTooltipOpen] = createSignal(false);
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = createSignal(false);
  const [session] = createResource(() => fetch("/api/session").then((res) => res.json()));

  // Get template groups from config
  const templateGroups = () => getTemplateConfigsByCategory();

  // Check if all documents are done processing
  const allDocumentsProcessed = createMemo(() => {
    const docs = generatedDocuments();
    const docKeys = Object.keys(docs);
    if (docKeys.length === 0) return false;
    return docKeys.every(key => docs[key].status === "completed" || docs[key].status === "error");
  });

  // Load the predefined template's prompt when selected
  createEffect(async () => {
    const templateId = selectedPredefinedTemplate();
    if (templateId && templateSourceType() === "predefined") {
      try {
        const prompt = await getPrompt(templateId);
        setCustomSystemPrompt(prompt);
      } catch (error) {
        console.error("Failed to load template prompt:", error);
        setCustomSystemPrompt("");
      }
    }
  });

  async function handleFileSelect(event) {
    const input = event.target;
    const name = input.name;
    const file = input.files?.[0];
    if (!file) return;
    const bytes = await readFile(file, "arrayBuffer");

    if (name === "outputTemplateFile") {
      setCustomTemplate(bytes);
    } else if (name === "inputTextFile") {
      setInputText("Reading file...");
      setOutputText("");
      setGeneratedDocuments({});
      const text = await parseDocument(bytes, file.type, file.name);
      setInputText(text);
      setOutputText("");
    }
  }

  async function processSelectedTemplates(text) {
    const selected = selectedTemplates();

    // Build list of templates to process (selected + custom if available)
    const templatesToProcess = [...selected];

    // Add custom template if in custom mode with template and prompt
    if (templateSourceType() === "custom" && customTemplate() && customSystemPrompt().trim()) {
      templatesToProcess.push("custom");
    }

    // Add predefined template if in predefined mode with valid selection
    if (templateSourceType() === "predefined" && selectedPredefinedTemplate()) {
      templatesToProcess.push("predefined-custom");
    }

    if (templatesToProcess.length === 0) return;

    // Initialize processing status for each template
    const initialStatus = {};
    templatesToProcess.forEach((templateId) => {
      initialStatus[templateId] = { status: "processing", blob: null, error: null };
    });
    setGeneratedDocuments(initialStatus);

    // Process all templates in parallel
    for (const templateId of templatesToProcess) {
      try {
        let templateFile, systemPrompt, defaultOutputData;

        if (templateId === "custom") {
          // Handle custom template
          systemPrompt = customSystemPrompt();
          defaultOutputData = templateConfigs["nih-cc-adult-healthy"].defaultOutput; // Use NIH consent output structure for custom
          templateFile = customTemplate();
        } else if (templateId === "predefined-custom") {
          // Handle predefined template with optional custom prompt
          const config = templateConfigs[selectedPredefinedTemplate()];
          systemPrompt = customSystemPrompt().trim() || (await getPrompt(selectedPredefinedTemplate()));
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
          model: model(),
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
        setGeneratedDocuments((prev) => ({
          ...prev,
          [templateId]: { status: "completed", blob, error: null },
        }));
      } catch (error) {
        console.error(`Error processing ${templateId}:`, error);
        setGeneratedDocuments((prev) => ({
          ...prev,
          [templateId]: { status: "error", blob: null, error: error.message },
        }));
      }
    }

    // await Promise.all(promises);
  }


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
    const doc = generatedDocuments()[templateId];
    if (!doc?.blob) return;
    const timestamp = formatDate(new Date());

    let filename;
    if (templateId === "custom") {
      filename = `custom-document-${timestamp}.docx`;
    } else if (templateId === "predefined-custom") {
      const config = templateConfigs[selectedPredefinedTemplate()];
      filename = config.filename.replace(".docx", `-${timestamp}.docx`);
    } else {
      const config = templateConfigs[templateId];
      filename = config.filename;
      filename = filename.replace(".docx", `-${timestamp}.docx`);
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
    const docs = generatedDocuments();
    Object.keys(docs).forEach((templateId) => {
      if (docs[templateId].status === "completed") {
        downloadDocument(templateId);
      }
    });
  }

  async function handleSubmit(event) {
    event?.preventDefault();
    const text = inputText();
    if (!text || selectedTemplates().length === 0) return;
    await processSelectedTemplates(text);
  }

  async function handleReset(event) {
    event?.preventDefault?.();
    const form = event?.target;
    form.inputTextFile.value = "";
    if (form.outputTemplateFile) {
      form.outputTemplateFile.value = "";
    }

    // Clear all state
    setInputText("");
    setOutputText("");
    setCustomTemplate(null);
    setSelectedTemplates([]);
    setGeneratedDocuments({});
    setSelectedPredefinedTemplate("");
    setTemplateSourceType("predefined");
    setModel("us.anthropic.claude-3-7-sonnet-20250219-v1:0");
    setCustomSystemPrompt("");
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

  return html`
    <div class="bg-info-subtle h-100 position-relative">
      <${AlertContainer} alerts=${alerts} onDismiss=${clearAlert} />
      <div class="container py-3">
        <form onSubmit=${handleSubmit} onReset=${handleReset}>
          <div class="row align-items-stretch">
            <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
              <div class="bg-white shadow  rounded p-3">
                <label for="inputText" class="form-label text-info fs-5 mb-1">Source Document<span class="text-danger">*</span></label>
                <input
                  type="file"
                  id="inputTextFile"
                  name="inputTextFile"
                  class="form-control form-control-sm  mb-3"
                  accept=".txt, .docx, .pdf"
                  onChange=${handleFileSelect} />

                <!-- Template Selection -->
                <div class="mb-3">
                  <label class="form-label text-info fs-5 mb-1">Form Templates<span class="text-danger">*</span></label>
                  <div class="border rounded p-2">
                    <${For} each=${templateGroups}>
                      ${(group) => html`
                        <div class="mb-2">
                          <div class="fw-bold text-muted small">${() => group.label}</div>
                          <${For} each=${() => group.options}>
                            ${(option) => html`
                              <div class="form-check form-control-sm min-height-auto py-0 ms-1">
                                <input
                                  class="form-check-input cursor-pointer "
                                  type="checkbox"
                                  id=${() => option.value}
                                  disabled=${() => option.disabled}
                                  checked=${() => selectedTemplates().includes(option.value)}
                                  onChange=${(e) => {
                                    const value = option.value;
                                    const isChecked = e.target.checked;
                                    setSelectedTemplates((prev) => (isChecked ? [...prev, value] : prev.filter((v) => v !== value)));
                                  }} />
                                <label
                                  class=${() =>
                                    ["form-check-label cursor-pointer ", option.disabled ? "text-muted" : ""].filter(Boolean).join(" ")}
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
                </div>

                <div class="d-flex flex-wrap justify-content-between align-items-center">
                  <${Show} when=${() => [1, 2].includes(session()?.user?.Role?.id)}>
                    <details class="small text-secondary mt-2 " open=${advancedOptionsOpen} onToggle=${(e) => setAdvancedOptionsOpen(e.target.open)}>
                      <summary class="form-label text-info fs-5 mb-1">Advanced Options</summary>
                      <div class="border rounded p-2">
                        <label for="model" class="form-label">Model</label>
                        <select
                          class="form-select form-select-sm cursor-pointer mb-2"
                          name="model"
                          id="model"
                          value=${model}
                          onChange=${(e) => setModel(e.target.value)}>
                          <option value="us.anthropic.claude-opus-4-1-20250805-v1:0">Opus 4.1</option>
                          <option value="us.anthropic.claude-sonnet-4-20250514-v1:0">Sonnet 4.0</option>
                          <option value="us.anthropic.claude-3-7-sonnet-20250219-v1:0">Sonnet 3.7</option>
                          <option value="us.anthropic.claude-3-5-haiku-20241022-v1:0">Haiku 3.5</option>
                          <option value="us.meta.llama4-maverick-17b-instruct-v1:0">Maverick</option>
                        </select>

                        <div class="d-flex justify-content-between">
                          <label class="form-label">Form Template</label>
                          <div>
                            <div class="form-check  form-check-inline">
                              <input
                                class="form-check-input"
                                type="radio"
                                name="templateSource"
                                id="templateSourcePredefined"
                                value="predefined"
                                checked=${() => templateSourceType() === "predefined"}
                                onChange=${(e) => setTemplateSourceType(e.target.value)} />
                              <label class="form-check-label" for="templateSourcePredefined"> Predefined template </label>
                            </div>
                            <div class="form-check  form-check-inline">
                              <input
                                class="form-check-input"
                                type="radio"
                                name="templateSource"
                                id="templateSourceCustom"
                                value="custom"
                                checked=${() => templateSourceType() === "custom"}
                                onChange=${(e) => setTemplateSourceType(e.target.value)} />
                              <label class="form-check-label" for="templateSourceCustom"> Custom template </label>
                            </div>
                          </div>
                        </div>

                        <${Show} when=${() => templateSourceType() === "predefined"}>
                          <div class="input-group mb-2">
                            <select
                              class="form-select form-select-sm cursor-pointer"
                              name="predefinedTemplate"
                              id="predefinedTemplate"
                              value=${selectedPredefinedTemplate}
                              onChange=${(e) => setSelectedPredefinedTemplate(e.target.value)}>
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

                        <${Show} when=${() => templateSourceType() === "custom"}>
                          <input
                            type="file"
                            id="outputTemplateFile"
                            name="outputTemplateFile"
                            class="form-control form-control-sm mb-2"
                            accept=".txt, .docx, .pdf"
                            onChange=${handleFileSelect} />

                          <div class="position-relative">
                            <label
                              for="systemPromptCustom"
                              class="form-label clickable-trigger"
                              onClick=${() => setCustomPromptTooltipOpen(!customPromptTooltipOpen())}
                              >Custom Prompt${() => advancedOptionsOpen() ? html`<span class="text-danger">*</span>` : ''} <img src="/assets/images/icon-circle-info.svg" alt="Info"
                            /></label>
                            <div class=${() => `click-popover ${customPromptTooltipOpen() ? 'show' : ''}`}>
                              Use this field to provide your own instructions for generating a form. The system will follow your prompt instead of a predefined template.
                            </div>
                          </div>
                          <div class="position-relative">
                            <textarea
                              class="form-control form-control-sm rounded-top-0 flex-grow-1"
                              id="systemPromptCustom"
                              name="systemPromptCustom"
                              rows="10"
                              style="resize: none; padding-right: 20px;"
                              placeholder="Enter a custom prompt to generate your form."
                              value=${customSystemPrompt}
                              onChange=${(e) => setCustomSystemPrompt(e.target.value)} />
                            <button
                              type="button"
                              class="position-absolute d-flex align-items-center justify-content-center"
                              style="bottom: 4px; right: 4px; width: 20px; height: 20px; padding: 0; border: none; background: transparent;"
                              title="Expand Custom Prompt"
                              onClick=${() => setExpandModalOpen(true)}>
                              <img src="/assets/images/icon-expand.svg" alt="Expand" height="12" />
                            </button>
                          </div>
                        <//>

                        <${Show} when=${() => templateSourceType() === "predefined"}>
                          <div class="position-relative">
                            <label
                              for="systemPromptPredefined"
                              class="form-label clickable-trigger"
                              onClick=${() => setCustomPromptTooltipOpen(!customPromptTooltipOpen())}
                              >Custom Prompt${() => advancedOptionsOpen() ? html`<span class="text-danger">*</span>` : ''} <img src="/assets/images/icon-circle-info.svg" alt="Info"
                            /></label>
                            <div class=${() => `click-popover ${customPromptTooltipOpen() ? 'show' : ''}`}>
                              Use this field to provide your own instructions for generating a form. The system will follow your prompt instead of a predefined template.
                            </div>
                          </div>
                          <div class="position-relative">
                            <textarea
                              class="form-control form-control-sm rounded-top-0 flex-grow-1"
                              id="systemPromptPredefined"
                              name="systemPromptPredefined"
                              rows="10"
                              style="resize: none; padding-right: 20px;"
                              placeholder="Enter a custom prompt to generate your form."
                              value=${customSystemPrompt}
                              onChange=${(e) => setCustomSystemPrompt(e.target.value)} />
                            <button
                              type="button"
                              class="position-absolute d-flex align-items-center justify-content-center"
                              style="bottom: 4px; right: 4px; width: 20px; height: 20px; padding: 0; border: none; background: transparent;"
                              title="Expand Custom Prompt"
                              onClick=${() => setExpandModalOpen(true)}>
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
                  when=${() => Object.keys(generatedDocuments()).length > 0}
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
                    <${Show} when=${allDocumentsProcessed}>
                      <div class="text-muted small fw-semibold">All processing is complete. The generated forms are available for download.</div>
                    <//>
                    <${For} each=${() => Object.keys(generatedDocuments())}>
                      ${(templateId) => {
                        const doc = () => generatedDocuments()[templateId];
                        const documentInfo = () => {
                          if (templateId === "custom") {
                            return { prefix: "Custom Document", label: "", filename: "custom-document.docx" };
                          } else if (templateId === "predefined-custom") {
                            const config = templateConfigs[selectedPredefinedTemplate()];
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
                                <span class="text-muted  fw-normal">: ${() => documentInfo().label}</span>
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
                              <div class="text-danger small text-truncate w-25" title=${() => doc().error}>Error: ${() => doc().error}</div>
                            <//>
                          </div>
                        `;
                      }}
                    <//>
                  </div>
                  <div class="h-100 d-flex flex-column justify-content-between">
                    <div class="text-end">
                      <${Show} when=${allDocumentsProcessed}>
                        <button type="button" class="btn btn-sm btn-link fw-semibold p-0" onClick=${downloadAll}>Download All</button>
                      <//>
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
              </div>
            </div>
          </div>
          <div class="row">
            <div class="col-md-6">
              <div class="d-flex-center mt-1 gap-1">
                <button type="reset" class="btn btn-light border rounded-pill">Reset</button>
                <button
                  type="submit"
                  class="btn btn-primary rounded-pill custom-tooltip"
                  data-tooltip=${() => {
                    if (!inputText() || selectedTemplates().length === 0 || (advancedOptionsOpen() && !customSystemPrompt().trim())) {
                      return "Not all required fields are provided.";
                    }
                    return "";
                  }}
                  disabled=${() => !inputText() || selectedTemplates().length === 0 || (advancedOptionsOpen() && !customSystemPrompt().trim())}>
                  Generate
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
      
      <${Modal}
        open=${expandModalOpen}
        setOpen=${setExpandModalOpen}
        dialogClass=${{"modal-xl": true}}
        bodyClass=${{"px-4": true}}
        children=${html`
          <div class="p-3">
            <textarea
              class="form-control form-control-sm mb-3"
              rows="25"
              style="resize: none;"
              placeholder="Enter a custom prompt to generate your form."
              value=${customSystemPrompt}
              onChange=${(e) => setCustomSystemPrompt(e.target.value)}
            />
            <div class="d-flex justify-content-end">
              <button
                type="button"
                class="btn btn-light border rounded-pill"
                onClick=${() => setExpandModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        `}
      />
    </div>
  `;
}
