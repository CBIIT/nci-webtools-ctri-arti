/**
 * Consent Crafter v2 — Field-based extraction pipeline
 *
 * Single pipeline: 2-chunk field extraction via system-prompt caching.
 * System prompt contains full schema + consent library + protocol (cached by Bedrock).
 * User messages request specific fields as raw JSON.
 *
 * UI: file upload → template selection → generate → DOCX download
 * State persisted to IndexedDB for session continuity.
 */

// #region Imports
import { createEffect, createMemo, createResource, For, Show } from "solid-js";
import html from "solid-js/html";

import { openDB } from "idb";
import { createStore, reconcile, unwrap } from "solid-js/store";

import { AlertContainer } from "../../../components/alert.js";
import FileInput from "../../../components/file-input.js";
import Tooltip from "../../../components/tooltip.js";
import { MODEL_OPTIONS } from "../../../models/model-options.js";
import { alerts, clearAlert } from "../../../utils/alerts.js";
import { docxExtractTextBlocks } from "../../../utils/docx.js";
import { createTimestamp, downloadBlob } from "../../../utils/files.js";
import { parseDocument } from "../../../utils/parsers.js";

import { getTemplateConfigsByCategory, templateConfigs } from "./config.js";
import { runFieldExtraction } from "./extract.js";
// #endregion

// #region Database
const DB_NAME = "consent-crafter-v2";
const DB_VERSION = 1;

async function getDatabase(userId) {
  return openDB(`${DB_NAME}-${userId}`, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "id", autoIncrement: true });
      }
    },
  });
}
// #endregion

// #region Template & Schema Analysis

/**
 * Analyze a DOCX template to produce a text summary of its structure.
 * Shows headings and blocks that contain {{variables}}, so the model can see
 * the exact sentence frames each field plugs into.
 */
async function analyzeTemplate(templateBuffer) {
  const { blocks } = await docxExtractTextBlocks(templateBuffer, { includeEmpty: false });
  const lines = [];
  const varRegex = /\{\{([^{}]+)\}\}/g;

  for (const block of blocks) {
    if (block.source !== "document") continue;
    const text = block.text.trim();
    if (!text) continue;

    const vars = [];
    let match;
    while ((match = varRegex.exec(text)) !== null) vars.push(match[1].trim());
    varRegex.lastIndex = 0;

    const isHeading = block.style && block.style.startsWith("Heading");

    if (isHeading) {
      lines.push(`\n[Block @${block.index}] HEADING (${block.style}): ${text.slice(0, 120)}`);
    } else if (vars.length > 0) {
      const preview = text.length > 200 ? text.slice(0, 200) + "..." : text;
      lines.push(`[Block @${block.index}] Variables: ${vars.join(", ")}`);
      lines.push(`  Context: ${preview}`);
    }
  }

  return lines.join("\n");
}

/**
 * Extract field descriptions from schema for inclusion in the prompt.
 */
function getFieldDescriptions(schema) {
  const descriptions = [];

  function walk(properties, prefix = "") {
    for (const [key, value] of Object.entries(properties)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value.description) {
        descriptions.push(`- ${fullKey}: ${value.description}`);
      }
      if (value.type === "object" && value.properties) {
        walk(value.properties, fullKey);
      }
      if (value.type === "array" && value.items?.properties) {
        walk(value.items.properties, `${fullKey}[]`);
      }
    }
  }

  if (schema.properties) {
    walk(schema.properties);
  }

  return descriptions.join("\n");
}

// #endregion

// #region Page Component
export default function Page() {
  let db = null;

  // #region State
  const defaultStore = {
    id: null,
    inputFile: null,
    selectedTemplates: [],
    model: MODEL_OPTIONS.AWS_BEDROCK.OPUS.v4_6,
    advancedOptionsOpen: false,
    templateSourceType: "predefined",
    selectedPredefinedTemplate: "",
    customTemplateFile: null,
    customLibraryUrl: "",
    generatedDocuments: {},
    templateCache: {},
    libraryCache: {},
    promptCache: {},
    schemaCache: {},
    extractionProgress: {
      status: "idle",
      completed: 0,
      total: 0,
      message: "",
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const [store, setStore] = createStore(structuredClone(defaultStore));

  const [session] = createResource(() => fetch("/api/v1/session").then((res) => res.json()));
  // #endregion

  // #region Session Persistence
  function setParam(key, value) {
    const url = new URL(window.location);
    value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
  }

  async function createSession() {
    const session = { ...unwrap(store), createdAt: Date.now(), updatedAt: Date.now() };
    delete session.id;
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

  createEffect(async () => {
    const user = session()?.user;
    if (!user?.email) return;
    db = await getDatabase(user.email);

    const sessionId = new URLSearchParams(window.location.search).get("id");
    if (sessionId) {
      await loadSession(sessionId);

      const interruptedJobs = Object.entries(store.generatedDocuments).filter(
        ([_id, job]) => job.status === "processing"
      );

      for (const [jobId] of interruptedJobs) {
        retryJob(jobId);
      }
    }
  });
  // #endregion

  // #region Template Caching
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

  async function fetchAndCacheLibrary(templateId) {
    const config = templateConfigs[templateId];
    if (!config.libraryUrl) return "";

    if (store.libraryCache[config.libraryUrl]) {
      return store.libraryCache[config.libraryUrl];
    }

    const response = await fetch(config.libraryUrl);
    const text = await response.text();
    setStore("libraryCache", config.libraryUrl, text);
    return text;
  }

  async function fetchAndCachePrompt(templateId) {
    const config = templateConfigs[templateId];
    if (!config.promptUrl) return "";

    if (store.promptCache[config.promptUrl]) {
      return store.promptCache[config.promptUrl];
    }

    const response = await fetch(config.promptUrl);
    const text = await response.text();
    setStore("promptCache", config.promptUrl, text);
    return text;
  }

  async function fetchAndCacheSchema(templateId) {
    const config = templateConfigs[templateId];
    if (!config.schemaUrl) return null;

    if (store.schemaCache[config.schemaUrl]) {
      return store.schemaCache[config.schemaUrl];
    }

    const response = await fetch(config.schemaUrl);
    const schema = await response.json();
    setStore("schemaCache", config.schemaUrl, schema);
    return schema;
  }
  // #endregion

  // #region Effects
  createEffect(async () => {
    const templateIds = [
      ...store.selectedTemplates,
      store.templateSourceType === "predefined" && store.selectedPredefinedTemplate,
    ].filter(Boolean);

    for (const templateId of templateIds) {
      try {
        await fetchAndCacheTemplate(templateId);
        await fetchAndCacheLibrary(templateId);
        await fetchAndCachePrompt(templateId);
        await fetchAndCacheSchema(templateId);
      } catch (error) {
        console.error(`Failed to fetch template ${templateId}:`, error);
      }
    }
  });
  // #endregion

  // #region Computed
  const allJobsProcessed = createMemo(() => {
    const jobs = store.generatedDocuments;
    const jobKeys = Object.keys(jobs);
    if (jobKeys.length === 0) return true;
    return jobKeys.every((key) => jobs[key].status === "completed" || jobs[key].status === "error");
  });

  const submitDisabled = createMemo(() => {
    if (!store.inputFile) return true;

    const hasBasicTemplates = store.selectedTemplates.length > 0;

    const hasValidAdvancedOptions =
      store.advancedOptionsOpen &&
      ((store.templateSourceType === "predefined" && store.selectedPredefinedTemplate) ||
        (store.templateSourceType === "custom" && store.customTemplateFile));

    return !(hasBasicTemplates || hasValidAdvancedOptions);
  });
  // #endregion

  // #region Job Processing
  async function processJob(jobId, jobConfig) {
    setStore("generatedDocuments", jobId, {
      status: "processing",
      blob: null,
      error: null,
      config: jobConfig,
    });

    setStore("extractionProgress", {
      status: "idle",
      completed: 0,
      total: 0,
      message: "",
    });

    await saveSession();

    try {
      const templateBuffer = await jobConfig.templateFile.arrayBuffer();

      let libraryText = "";
      if (jobConfig.libraryUrl) {
        if (store.libraryCache[jobConfig.libraryUrl]) {
          libraryText = store.libraryCache[jobConfig.libraryUrl];
        } else {
          const libraryResponse = await fetch(jobConfig.libraryUrl);
          libraryText = await libraryResponse.text();
          setStore("libraryCache", jobConfig.libraryUrl, libraryText);
        }
      }

      const promptText = store.promptCache[jobConfig.promptUrl]
        || await fetchAndCachePrompt(jobConfig.templateId);
      const schema = store.schemaCache[jobConfig.schemaUrl]
        || await fetchAndCacheSchema(jobConfig.templateId);

      // Analyze template structure so the model sees exact sentence frames
      const templateAnalysis = await analyzeTemplate(templateBuffer);
      const fieldDescriptions = getFieldDescriptions(schema);

      const extractedData = await runFieldExtraction({
        protocolText: jobConfig.inputText,
        promptTemplate: promptText,
        consentLibrary: libraryText,
        fullSchema: schema,
        templateAnalysis,
        fieldDescriptions,
        model: jobConfig.model,
        runModelFn: runModel,
        onProgress: (progress) => {
          setStore("extractionProgress", progress);
        },
      });

      // Generate DOCX using docx-templates
      const { createReport, listCommands } = await import("docx-templates");
      const cmdDelimiter = ["{{", "}}"];

      // Set defaults for any missing template variables
      const commands = await listCommands(templateBuffer, cmdDelimiter);
      const variables = commands
        .filter((c) => ["INS", "FOR", "IF"].includes(c.type))
        .map((c) => {
          if (c.type === "IF") {
            return { type: "boolean", name: c.code.trim().split(/\s/)[0] };
          }
          return {
            type: c.type === "FOR" ? "array" : "string",
            name: c.code.split(" ").pop(),
          };
        })
        .filter((c) => !c.name.startsWith("$") && !c.name.includes("."));

      for (const variable of variables) {
        if (extractedData[variable.name] === undefined || extractedData[variable.name] === null) {
          extractedData[variable.name] = variable.type === "array" ? [] : variable.type === "boolean" ? false : "";
        }
      }

      const buffer = await createReport({
        template: templateBuffer,
        data: extractedData,
        cmdDelimiter,
        processLineBreaks: true,
      });

      const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const blob = new Blob([buffer], { type: DOCX_MIME });
      setStore("generatedDocuments", jobId, {
        status: "completed",
        blob,
        data: extractedData,
        error: null,
        config: jobConfig,
      });
    } catch (error) {
      console.error(`Error processing job ${jobId}:`, error);
      setStore("generatedDocuments", jobId, {
        status: "error",
        blob: null,
        error: error.message,
        config: jobConfig,
      });
      setStore("extractionProgress", "status", "error");
    } finally {
      await saveSession();
    }
  }

  async function retryJob(jobId) {
    const job = store.generatedDocuments[jobId];
    if (!job?.config) return;

    await processJob(jobId, job.config);
  }
  // #endregion

  // #region Event Handlers
  async function handleSubmit(event) {
    event?.preventDefault();

    if (submitDisabled()) return;

    const inputText = await parseDocument(
      await store.inputFile.arrayBuffer(),
      store.inputFile.type,
      store.inputFile.name
    );

    const jobs = [];

    for (const templateId of store.selectedTemplates) {
      const jobId = crypto.randomUUID();
      const config = templateConfigs[templateId];
      const templateFile = store.templateCache[templateId];

      if (!templateFile) {
        console.error(`Template ${templateId} not cached`);
        continue;
      }

      const jobConfig = {
        inputFile: store.inputFile,
        inputText,
        templateFile,
        templateId,
        libraryUrl: config.libraryUrl,
        promptUrl: config.promptUrl,
        schemaUrl: config.schemaUrl,
        model: store.model,
        displayInfo: {
          prefix: config.prefix || "",
          label: config.label,
          filename: config.filename,
        },
      };

      jobs.push({ jobId, jobConfig });
    }

    if (store.advancedOptionsOpen) {
      if (store.templateSourceType === "predefined" && store.selectedPredefinedTemplate) {
        const jobId = crypto.randomUUID();
        const config = templateConfigs[store.selectedPredefinedTemplate];
        const templateFile = store.templateCache[store.selectedPredefinedTemplate];

        if (templateFile) {
          const jobConfig = {
            inputFile: store.inputFile,
            inputText,
            templateFile,
            templateId: store.selectedPredefinedTemplate,
            libraryUrl: config.libraryUrl,
            promptUrl: config.promptUrl,
            schemaUrl: config.schemaUrl,
            model: store.model,
            displayInfo: {
              prefix: config.prefix || "",
              label: config.label + " (Custom)",
              filename: config.filename.replace(".docx", "-custom.docx"),
            },
          };

          jobs.push({ jobId, jobConfig });
        }
      } else if (store.templateSourceType === "custom" && store.customTemplateFile) {
        const jobId = crypto.randomUUID();

        const jobConfig = {
          inputFile: store.inputFile,
          inputText,
          templateFile: store.customTemplateFile,
          templateId: null,
          libraryUrl: store.customLibraryUrl || null,
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

    setStore("generatedDocuments", reconcile({}, { merge: true }));
    setStore("id", await createSession());
    setParam("id", store.id);

    for (const { jobId, jobConfig } of jobs) {
      processJob(jobId, jobConfig);
    }
  }

  async function handleReset(event) {
    event?.preventDefault();
    setStore(structuredClone(defaultStore));
    setParam("id", null);
  }

  async function runModel(params) {
    const response = await fetch("/api/v1/model", {
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
    if (!job?.blob || job.status !== "completed") return;

    const timestamp = createTimestamp();
    const baseFilename = job.config.displayInfo.filename;
    const filename = baseFilename.replace(".docx", `-${timestamp}.docx`);
    downloadBlob(filename, job.blob);
  }

  function downloadAll() {
    Object.keys(store.generatedDocuments).forEach((jobId) => {
      if (store.generatedDocuments[jobId].status === "completed") {
        downloadJob(jobId);
      }
    });
  }

  function getProgressMessage(progress) {
    if (progress.message) return progress.message;

    if (progress.status === "idle" || progress.total === 0) {
      return "We are generating your forms now. This may take a few moments.";
    }
    const messages = {
      extracting: "Extracting fields...",
      applying: "Generating consent document...",
      completed: "Generation complete.",
      error: "An error occurred during generation.",
    };
    return messages[progress.status] || "Processing...";
  }
  // #endregion

  // #region Render
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
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.OPUS.v4_6}>Opus 4.6</option>
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.SONNET.v4_6}>Sonnet 4.6</option>
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
                          <label class="form-label">Consent Library URL (optional)</label>
                          <input
                            type="text"
                            class="form-control form-control-sm mb-2"
                            placeholder="/templates/nih-cc/consent-library.txt"
                            value=${() => store.customLibraryUrl}
                            onInput=${(e) => setStore("customLibraryUrl", e.target.value)}
                          />
                        <//>
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
                        fallback=${() => getProgressMessage(store.extractionProgress)}
                      >
                        All processing is complete. The generated forms are available for download.
                      <//>
                    </div>
                    <!-- Progress bar -->
                    <${Show} when=${() => !allJobsProcessed() && store.extractionProgress.total > 0}>
                      <div class="progress" style="height: 6px;">
                        <div
                          class="progress-bar"
                          role="progressbar"
                          style=${() =>
                            `width: ${Math.round((store.extractionProgress.completed / store.extractionProgress.total) * 100)}%`}
                          aria-valuenow=${() => store.extractionProgress.completed}
                          aria-valuemin="0"
                          aria-valuemax=${() => store.extractionProgress.total}
                        ></div>
                      </div>
                    <//>

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
                                <${Show} when=${() => job().data}>
                                  <span class="ms-2">
                                    (${() => Object.keys(job().data || {}).length} fields extracted)
                                  </span>
                                <//>
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
  // #endregion
}
// #endregion
