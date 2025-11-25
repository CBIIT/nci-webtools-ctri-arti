import { createEffect, createMemo, createResource, For, Show } from "solid-js";
import html from "solid-js/html";

import { createReport, listCommands } from "docx-templates";
import { openDB } from "idb";
import { createStore, reconcile, unwrap } from "solid-js/store";
import yaml from "yaml";

import { AlertContainer } from "../../../components/alert.js";
import ClassToggle from "../../../components/class-toggle.js";
import FileInput from "../../../components/file-input.js";
import Tooltip from "../../../components/tooltip.js";
import { MODEL_OPTIONS } from "../../../models/model-options.js";
import { alerts, clearAlert } from "../../../utils/alerts.js";
import { createTimestamp, downloadBlob } from "../../../utils/files.js";
import { parseDocument } from "../../../utils/parsers.js";

import { getPrompt, getTemplateConfigsByCategory, templateConfigs } from "./config.js";

// ============= Database Layer =============
async function getDatabase(userEmail = "anonymous") {
  const userName = userEmail
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "");
  const dbName = `arti-consent-crafter-${userName}`;
  return await openDB(dbName, 1, {
    upgrade(db) {
      const store = db.createObjectStore("sessions", {
        keyPath: "id",
        autoIncrement: true,
      });
      store.createIndex("createdAt", "createdAt");
    },
  });
}

// ============= Main Component =============
export default function Page() {
  let db = null;

  // ============= Store & State =============
  const defaultStore = {
    // Session
    id: null,

    // Input - single File blob
    inputFile: null,
    inputText: "",

    // Basic template selection - array of template IDs
    selectedTemplates: [],

    // Advanced options
    model: MODEL_OPTIONS.AWS_BEDROCK.SONNET.v3_7,
    advancedOptionsOpen: false,
    templateSourceType: "predefined",
    selectedPredefinedTemplate: "",
    customTemplateFile: null,
    customPrompt: "",

    // Job results - each job stores complete config for easy retry
    generatedDocuments: {},
    // Structure: { [jobId]: {
    //   status, blob, error,
    //   config: { inputFile, templateFile, prompt, model, displayInfo }
    // }}

    // Template cache - fetched templates stored as Files
    templateCache: {},

    // Timestamps
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const [store, setStore] = createStore(structuredClone(defaultStore));

  const [session] = createResource(() => fetch("/api/session").then((res) => res.json()));

  // ============= Session Persistence =============

  function setParam(key, value) {
    const url = new URL(window.location);
    value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
  }

  async function createSession() {
    const session = { ...unwrap(store), createdAt: Date.now(), updatedAt: Date.now() };
    delete session.id; // allow auto-increment
    const id = await db.add("sessions", session);
    return id;
  }

  async function saveSession() {
    const session = { ...unwrap(store), updatedAt: Date.now() };
    return await db.put("sessions", session);
  }

  async function loadSession(id) {
    const session = await db.get("sessions", +id);
    setStore(session);
  }

  // Initialize database and load session on mount
  createEffect(async () => {
    const user = session()?.user;
    if (!user?.email) return;
    db = await getDatabase(user.email);

    const sessionId = new URLSearchParams(window.location.search).get("id");
    if (sessionId) {
      await loadSession(sessionId);

      // Auto-retry interrupted jobs
      const interruptedJobs = Object.entries(store.generatedDocuments).filter(
        ([_id, job]) => job.status === "processing"
      );

      for (const [jobId] of interruptedJobs) {
        retryJob(jobId);
      }
    }
  });

  // ============= Template Handling =============

  async function fetchAndCacheTemplate(templateId) {
    if (store.templateCache[templateId]) {
      return store.templateCache[templateId];
    }

    const config = templateConfigs[templateId];
    const response = await fetch(config.templateUrl);
    const arrayBuffer = await response.arrayBuffer();
    const file = new File([arrayBuffer], `${templateId}.docx`, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    setStore("templateCache", templateId, file);
    return file;
  }

  // Pre-fetch templates when selected
  createEffect(async () => {
    for (const templateId of store.selectedTemplates) {
      try {
        await fetchAndCacheTemplate(templateId);
      } catch (error) {
        console.error(`Failed to fetch template ${templateId}:`, error);
      }
    }
  });

  // Pre-fetch advanced template when selected
  createEffect(async () => {
    if (store.selectedPredefinedTemplate && store.templateSourceType === "predefined") {
      try {
        await fetchAndCacheTemplate(store.selectedPredefinedTemplate);
        const prompt = await getPrompt(store.selectedPredefinedTemplate);
        setStore("customPrompt", prompt);
      } catch (error) {
        console.error("Failed to load template or prompt:", error);
        setStore("customPrompt", "");
      }
    }
  });

  // ============= Computed Properties =============

  const allJobsProcessed = createMemo(() => {
    const jobs = store.generatedDocuments;
    const jobKeys = Object.keys(jobs);
    if (jobKeys.length === 0) return true;
    return jobKeys.every((key) => jobs[key].status === "completed" || jobs[key].status === "error");
  });

  const submitDisabled = createMemo(() => {
    // Must have input file
    if (!store.inputFile) return true;

    // Check if we have either basic templates OR valid advanced options
    const hasBasicTemplates = store.selectedTemplates.length > 0;

    const hasValidAdvancedOptions =
      store.advancedOptionsOpen &&
      ((store.templateSourceType === "predefined" &&
        store.selectedPredefinedTemplate &&
        store.customPrompt.trim()) ||
        (store.templateSourceType === "custom" &&
          store.customTemplateFile &&
          store.customPrompt.trim()));

    return !(hasBasicTemplates || hasValidAdvancedOptions);
  });

  // ============= Job Processing =============

  async function processJob(jobId, jobConfig) {
    // 1. Set job status to processing
    setStore("generatedDocuments", jobId, {
      status: "processing",
      blob: null,
      error: null,
      config: jobConfig,
    });

    await saveSession();

    try {
      // 2. AI extraction
      const systemPrompt =
        "Please process the ENTIRE document according to your instructions and your role: <document>{{document}}</document>. The document may be quite lengthy, so take your time. After reading the document and user instructions, provide your response below, without preamble. Begin your detailed extraction and JSON generation as soon as you receive further instructions from the user.";

      const params = {
        model: jobConfig.model,
        messages: [
          {
            role: "user",
            content: [{ text: jobConfig.prompt.replace("{{document}}", "see above") }],
          },
        ],
        system: systemPrompt.replace("{{document}}", jobConfig.inputText),
        thoughtBudget: 8000,
        stream: false,
      };

      const output = await runModel(params);
      const jsonOutput =
        output.match(/```json\s*([\s\S]*?)\s*```/)?.[1] ||
        output.match(/{\s*[\s\S]*?}/)?.[0] ||
        "{}";

      const data = yaml.parse(jsonOutput);

      // 3. Update job status to completed with JSON data
      setStore("generatedDocuments", jobId, {
        status: "completed",
        data,
        error: null,
        config: jobConfig,
      });
    } catch (error) {
      console.error(`Error processing job ${jobId}:`, error);
      setStore("generatedDocuments", jobId, {
        status: "error",
        data: null,
        error: error.message,
        config: jobConfig,
      });
    } finally {
      await saveSession();
    }
  }

  async function retryJob(jobId) {
    const job = store.generatedDocuments[jobId];
    if (!job?.config) return;

    await processJob(jobId, job.config);
  }

  async function generateDocument(data, templateFile) {
    try {
      const templateBuffer = await templateFile.arrayBuffer();
      const cmdDelimiter = ["{{", "}}"];

      // Try to ensure variables in template are present in data
      const commands = await listCommands(templateBuffer, cmdDelimiter);

      const variables = commands
        .filter((c) => ["INS", "FOR"].includes(c.type))
        .map((c) => ({
          type: c.type === "FOR" ? "array" : "string", 
          name: c.code.split(" ").pop() 
        }))
        .filter((c) => !c.name.startsWith("$"));

      for (const variable of variables) {
        const defaultValue = variable.type === "array" ? [] : "";
        data[variable.name] ||= defaultValue;
      }

      const buffer = await createReport({ template: templateBuffer, data, cmdDelimiter });
      const type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      return new Blob([buffer], { type });
    } catch (error) {
      console.error("Error generating document:", error);
      throw error;
    }
  }

  // ============= Submit Handler =============

  async function handleSubmit(event) {
    event?.preventDefault();

    if (submitDisabled()) return;

    const inputText = await parseDocument(
      await store.inputFile.arrayBuffer(),
      store.inputFile.type,
      store.inputFile.name
    );

    const jobs = [];

    // Create jobs for basic template selections
    for (const templateId of store.selectedTemplates) {
      const jobId = crypto.randomUUID();
      const config = templateConfigs[templateId];
      const templateFile = store.templateCache[templateId];

      if (!templateFile) {
        console.error(`Template ${templateId} not cached`);
        continue;
      }

      const prompt = await getPrompt(templateId);

      const jobConfig = {
        inputFile: store.inputFile,
        inputText,
        templateFile,
        prompt,
        model: store.model,
        displayInfo: {
          prefix: config.prefix || "",
          label: config.label,
          filename: config.filename,
        },
      };

      jobs.push({ jobId, jobConfig });
    }

    // Create job for advanced options if configured
    if (store.advancedOptionsOpen) {
      if (
        store.templateSourceType === "predefined" &&
        store.selectedPredefinedTemplate &&
        store.customPrompt.trim()
      ) {
        const jobId = crypto.randomUUID();
        const config = templateConfigs[store.selectedPredefinedTemplate];
        const templateFile = store.templateCache[store.selectedPredefinedTemplate];

        if (templateFile) {
          const jobConfig = {
            inputFile: store.inputFile,
            inputText,
            templateFile,
            prompt: store.customPrompt,
            model: store.model,
            displayInfo: {
              prefix: config.prefix || "",
              label: config.label + " (Custom)",
              filename: config.filename.replace(".docx", "-custom.docx"),
            },
          };

          jobs.push({ jobId, jobConfig });
        }
      } else if (
        store.templateSourceType === "custom" &&
        store.customTemplateFile &&
        store.customPrompt.trim()
      ) {
        const jobId = crypto.randomUUID();

        const jobConfig = {
          inputFile: store.inputFile,
          inputText,
          templateFile: store.customTemplateFile,
          prompt: store.customPrompt,
          model: store.model,
          displayInfo: {
            prefix: "Custom",
            label: "Custom Document",
            filename: "custom-document.docx",
          },
        };

        jobs.push({ jobId, jobConfig });
      }
    }

    if (jobs.length === 0) return;

    // Clear previous results (merge to replace nested object)
    setStore("generatedDocuments", reconcile({}, { merge: true }));
    setStore("id", await createSession());
    setParam("id", store.id);

    // Start all jobs in parallel
    for (const { jobId, jobConfig } of jobs) {
      processJob(jobId, jobConfig);
    }
  }

  async function handleReset(event) {
    event?.preventDefault();
    setStore(structuredClone(defaultStore));
    setParam("id", null);
  }

  // ============= Utility Functions =============

  async function runModel(params) {
    const response = await fetch("/api/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();
    const text = data.output?.message?.content?.map((c) => c.text || "").join(" ") || "";
    return text;
  }

  async function downloadJob(jobId) {
    const job = store.generatedDocuments[jobId];
    if (!job?.data || job.status !== "completed") return;

    try {
      // Generate document on-demand
      const blob = await generateDocument(unwrap(job.data), job.config.templateFile);

      // Create timestamp for filename
      const timestamp = createTimestamp();
      const baseFilename = job.config.displayInfo.filename;
      const filename = baseFilename.replace(".docx", `-${timestamp}.docx`);

      // Trigger download
      downloadBlob(filename, blob);
    } catch (error) {
      console.error(`Error downloading job ${jobId}:`, error);
      // Could add user notification here
    }
  }

  function downloadAll() {
    Object.keys(store.generatedDocuments).forEach((jobId) => {
      if (store.generatedDocuments[jobId].status === "completed") {
        downloadJob(jobId);
      }
    });
  }

  // ============= UI Component =============

  return html`
    <div class="bg-info-subtle h-100 position-relative">
      <${AlertContainer} alerts=${alerts} onDismiss=${clearAlert} />
      <div class="container py-3">
        <form onSubmit=${handleSubmit} onReset=${handleReset}>
          <div class="row align-items-stretch">
            <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
              <div class="bg-white shadow rounded p-3 card-lg">
                <label class="form-label required text-info fs-5 mb-1">Source Document</label>
                <${FileInput}
                  value=${() => [store.inputFile]}
                  onChange=${(ev) => setStore("inputFile", ev.target.files[0] || null)}
                  accept="text/*,.doc,.docx,.pdf"
                  class="form-control form-control-sm mb-3"
                />

                <!-- Template Selection -->
                <div class="mb-3">
                  <label class="form-label required text-info fs-5 mb-1">Form Templates</label>
                  <div class="border rounded p-2">
                    <${For} each=${getTemplateConfigsByCategory}>
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
                                  checked=${() => store.selectedTemplates.includes(option.value)}
                                  onChange=${(e) =>
                                    setStore("selectedTemplates", (prev) =>
                                      e.target.checked
                                        ? prev.concat([option.value])
                                        : prev.filter((v) => v !== option.value)
                                    )}
                                />
                                <label
                                  class="form-check-label cursor-pointer"
                                  classList=${() => ({ "text-muted": option.disabled })}
                                  for=${() => option.value}
                                >
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
                    <details
                      class="small text-secondary mt-2"
                      open=${() => store.advancedOptionsOpen}
                      onToggle=${(e) => setStore("advancedOptionsOpen", e.target.open)}
                    >
                      <summary class="form-label text-info fs-5 mb-1">Advanced Options</summary>
                      <div class="border rounded p-2">
                        <label for="model" class="form-label required">Default Model</label>
                        <select
                          class="form-select form-select-sm cursor-pointer mb-2"
                          name="model"
                          id="model"
                          value=${() => store.model}
                          onChange=${(e) => setStore("model", e.target.value)}
                        >
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.OPUS.v4_5}>Opus 4.5</option>
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.SONNET.v4_5}>Sonnet 4.5</option>
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.SONNET.v3_7}>Sonnet 3.7</option>
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.HAIKU.v4_5}>Haiku 4.5</option>
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.MAVERICK.v4_0_17b}>
                            Maverick
                          </option>
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
                                onChange=${(e) => setStore("templateSourceType", e.target.value)}
                              />
                              <label class="form-check-label" for="templateSourcePredefined">
                                Predefined template
                              </label>
                            </div>
                            <div class="form-check form-check-inline">
                              <input
                                class="form-check-input"
                                type="radio"
                                name="templateSource"
                                id="templateSourceCustom"
                                value="custom"
                                checked=${() => store.templateSourceType === "custom"}
                                onChange=${(e) => setStore("templateSourceType", e.target.value)}
                              />
                              <label class="form-check-label" for="templateSourceCustom">
                                Custom template
                              </label>
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
                              onChange=${(e) =>
                                setStore("selectedPredefinedTemplate", e.target.value)}
                            >
                              <option value="">[No Template]</option>
                              <${For} each=${getTemplateConfigsByCategory}>
                                ${(group) => html`
                                  <optgroup label=${() => group.label}>
                                    <${For} each=${() => group.options}>
                                      ${(option) => html`
                                        <option
                                          value=${() => option.value}
                                          disabled=${() => option.disabled}
                                        >
                                          ${() =>
                                            `${templateConfigs[option.value].prefix} - ${templateConfigs[option.value].label}`}
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
                          <${FileInput}
                            value=${() => [store.customTemplateFile]}
                            onChange=${(ev) =>
                              setStore("customTemplateFile", ev.target.files[0] || null)}
                            accept=".docx"
                            class="form-control form-control-sm mb-2"
                          />
                        <//>

                        <!-- Custom Prompt -->
                        <div class="mb-2">
                          <${ClassToggle}
                            class="position-relative"
                            activeClass="show"
                            event="hover"
                          >
                            <label
                              class="form-label"
                              classList=${() => ({
                                required:
                                  store.selectedPredefinedTemplate || store.customTemplateFile,
                              })}
                              toggle
                            >
                              Custom Prompt
                            </label>
                            <img
                              class="ms-1"
                              src="/assets/images/icon-circle-info.svg"
                              alt="Info"
                              toggle
                            />
                            <div
                              class="tooltip shadow p-1 position-absolute top-100 start-0 p-2 bg-white border rounded w-50 text-muted text-center"
                            >
                              Use this field to provide your own instructions for generating a form.
                              The system will follow your prompt instead of a predefined template.
                            </div>
                          <//>
                        </div>
                        <textarea
                          class="form-control form-control-sm resize-vertical"
                          id="systemPrompt"
                          name="systemPrompt"
                          rows="8"
                          placeholder="Enter a custom prompt to generate your form."
                          value=${() => store.customPrompt}
                          onInput=${(e) => setStore("customPrompt", e.target.value)}
                        />
                      </div>
                    </details>
                  <//>
                </div>
              </div>
            </div>
            <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
              <div
                class="d-flex flex-column bg-white shadow border rounded p-3 flex-grow-1 card-lg"
              >
                <${Show}
                  when=${() => Object.keys(store.generatedDocuments).length > 0}
                  fallback=${html`<div class="d-flex h-100 py-5">
                    <div class="text-center py-5">
                      <h1 class="text-info mb-3">Welcome to Consent Crafter</h1>
                      <div>
                        To get started, upload your source document, select one or more form
                        templates from the list, and click Generate to create tailored consent
                        documents.
                      </div>
                    </div>
                  </div>`}
                >
                  <div class="d-flex flex-column gap-2">
                    <div class="text-muted small fw-semibold">
                      <${Show}
                        when=${allJobsProcessed}
                        fallback="We are generating your forms now. This may take a few moments."
                      >
                        All processing is complete. The generated forms are available for download.
                      <//>
                    </div>

                    <${For} each=${() => Object.keys(store.generatedDocuments)}>
                      ${(jobId) => {
                        const job = () => store.generatedDocuments[jobId];

                        return html`
                          <div
                            class="d-flex justify-content-between align-items-center p-2 border rounded"
                          >
                            <div class="flex-grow-1">
                              <div class="fw-medium">
                                <span>${() => job().config?.displayInfo?.prefix || ""}</span>
                                <span class="text-muted fw-normal">
                                  : ${() => job().config?.displayInfo?.label || "Unknown"}</span
                                >
                              </div>
                              <div class="small text-muted">
                                ${() => job().config?.displayInfo?.filename || "document.docx"}
                              </div>
                            </div>
                            <${Show} when=${() => job()?.status === "processing"}>
                              <div
                                class="spinner-border spinner-border-sm text-primary me-2"
                                role="status"
                              >
                                <span class="visually-hidden">Processing...</span>
                              </div>
                            <//>
                            <${Show} when=${() => job()?.status === "completed"}>
                              <button
                                type="button"
                                class="btn btn-outline-light"
                                onClick=${() => downloadJob(jobId)}
                              >
                                <img
                                  src="/assets/images/icon-download.svg"
                                  height="16"
                                  alt="Download"
                                />
                              </button>
                            <//>
                            <${Show} when=${() => job()?.status === "error"}>
                              <div class="d-flex align-items-center gap-2">
                                <button
                                  type="button"
                                  class="btn btn-sm btn-outline-danger"
                                  title=${() => job().error}
                                  onClick=${() => retryJob(jobId)}
                                >
                                  Retry
                                </button>
                              </div>
                            <//>
                          </div>
                        `;
                      }}
                    <//>
                  </div>
                  <${Show} when=${allJobsProcessed}>
                    <div class="h-100 d-flex flex-column justify-content-between">
                      <div class="text-end">
                        <button
                          type="button"
                          class="btn btn-sm btn-link fw-semibold p-0"
                          onClick=${downloadAll}
                        >
                          Download All
                        </button>
                      </div>
                      <div class="mt-auto d-flex align-items-center">
                        <img
                          src="/assets/images/icon-star.svg"
                          alt="Star"
                          class="me-2"
                          height="16"
                        />
                        <div>
                          <span class="me-1">We would love your feedback!</span>
                          <a href="https://www.cancer.gov/" target="_blank">Take a quick survey</a>
                          &nbsp;to help us improve.
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
                <button type="reset" class="btn btn-wide btn-wide-info px-3 py-3">Reset</button>
                <${Tooltip}
                  title="Not all required fields are provided."
                  placement="top"
                  arrow=${true}
                  class="text-white bg-primary"
                  disableHoverListener=${() => !submitDisabled()}
                >
                  <button
                    toggle
                    type="submit"
                    class="btn btn-wide px-3 py-3 btn-wide-primary"
                    disabled=${submitDisabled}
                  >
                    Generate
                  </button>
                <//>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
}
