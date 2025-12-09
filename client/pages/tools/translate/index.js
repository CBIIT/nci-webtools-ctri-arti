import { createMemo, createSignal, For, Show } from "solid-js";
import html from "solid-js/html";

import { createStore, reconcile } from "solid-js/store";

import FileInput from "../../../components/file-input.js";
import { useAuthContext } from "../../../contexts/auth-context.js";
import { MODEL_OPTIONS } from "../../../models/model-options.js";
import { translateDocx } from "../../../utils/docx.js";
import { createTimestamp, downloadBlob } from "../../../utils/files.js";
import { parseDocument } from "../../../utils/parsers.js";
import { useSessionPersistence } from "../translate/hooks.js";

// #region Constants
const AUTO_LANGUAGE = { value: "auto", label: "Auto" };
const LANGUAGES = [
  { value: "am", label: "Amharic" },
  { value: "ar", label: "Arabic" },
  { value: "fr", label: "French" },
  { value: "pt", label: "Portuguese" },
  { value: "es-MX", label: "Spanish (Mexican)" },
  { value: "vi", label: "Vietnamese" },
];
const ROWS_PER_COLUMN = 4;
const MODELS = [
  { value: MODEL_OPTIONS.AWS_BEDROCK.HAIKU.v4_5, label: "Model: Haiku" },
  { value: MODEL_OPTIONS.AWS_BEDROCK.SONNET.v4_5, label: "Model: Sonnet" },
  { value: MODEL_OPTIONS.AWS_BEDROCK.OPUS.v4_5, label: "Model: Opus" },
];
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SIZE_THRESHOLD = 40 * 1024; // 40KB - use batch translation above this
const BATCH_DELIMITER = "\r\n";
const defaultStore = { id: null, generatedDocuments: {} };
// #endregion

// #region Utilities
function isDocxFile(contentType, filename) {
  return contentType === DOCX_MIME_TYPE || filename?.toLowerCase().endsWith(".docx");
}

function base64ToArrayBuffer(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function getDocumentSize(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  return Math.floor((base64.length * 3) / 4);
}

function getLanguageLabel(code) {
  return LANGUAGES.find((l) => l.value === code)?.label || code.toUpperCase();
}

function makeFilename(originalName, langCode) {
  const ext = originalName?.split(".").pop() || "txt";
  const base = (originalName || "translated_text").replace(/\.[^/.]+$/, "");
  return `${base}-${langCode}.${ext}`;
}

function readFile(file, type = "text") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    if (type === "arrayBuffer") reader.readAsArrayBuffer(file);
    else if (type === "text") reader.readAsText(file);
    else if (type === "dataURL") reader.readAsDataURL(file);
    else reject(new Error("Unsupported read type"));
  });
}
// #endregion

// #region Translation Core
function buildTranslationPrompt(targetLang, sourceLang, options = {}) {
  const { formality = "formal", profanityMask = true, brevity = false, isBatch = false } = options;
  const langDirective =
    sourceLang && sourceLang !== "auto"
      ? `Translate from ${sourceLang.toUpperCase()} to ${targetLang}.`
      : `Detect the source language and translate to ${targetLang}.`;

  const rules = [
    "You are a translation engine emulating Amazon Translate.",
    langDirective,
    formality === "formal" && "Use formal language constructs and formal pronouns.",
    formality === "informal" && "Use informal language constructs and familiar pronouns.",
    profanityMask && 'Replace ANY profane words/phrases with "?$#@$".',
    brevity && "Provide concise translations, reduce length where appropriate.",
    "Leave untranslatable tokens unchanged (IDs, URLs, emails, placeholders).",
    "Preserve punctuation, whitespace, line breaks, capitalization, numerals exactly.",
    "Do not add, remove, or paraphrase content.",
    isBatch &&
      "Input: JSON array of strings. Output: JSON array of translated strings in EXACT same order. Return ONLY the JSON array, no explanation or markdown.",
    !isBatch && "Output ONLY the translated text (plain text), with no quotes or explanations.",
  ].filter(Boolean);

  return isBatch ? rules.join("\n") : rules.join(" ");
}

async function runModel(params) {
  const res = await fetch("/api/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Model request failed. (${res.status})`);
  const data = await res.json();
  return data?.output?.message?.content?.map((c) => c.text || "").join(" ") || "";
}

async function translateBatch(texts, engine, options) {
  const { sourceLang, targetLang, formality, profanityMask, brevity } = options;

  if (engine === "aws") {
    const joined = texts.join(BATCH_DELIMITER);
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: joined,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
      }),
    });
    if (!res.ok) throw new Error(`Translation request failed. (${res.status})`);
    const data = await res.json();
    if (typeof data !== "string") return texts.map(() => "");
    const results = data.split(BATCH_DELIMITER);
    if (results.length !== texts.length) {
      console.warn(
        `AWS batch translation count mismatch: expected ${texts.length}, got ${results.length}`
      );
    }
    return results;
  }

  // LLM engine
  const targetLabel = getLanguageLabel(targetLang);
  const prompt = buildTranslationPrompt(targetLabel, sourceLang, {
    formality,
    profanityMask,
    brevity,
    isBatch: true,
  });
  const output = await runModel({
    model: engine,
    messages: [{ role: "user", content: [{ text: JSON.stringify(texts) }] }],
    system: prompt,
    stream: false,
  });

  try {
    const parsed = JSON.parse(output.trim());
    if (Array.isArray(parsed) && parsed.length === texts.length) return parsed;
    throw new Error("Invalid response format");
  } catch {
    const match = output.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse translation response as JSON array");
  }
}
// #endregion

// #region Translation Strategies
async function translateDocument(jobConfig) {
  const isDocx = isDocxFile(jobConfig.contentType, jobConfig.displayInfo?.filename);
  const docSize = getDocumentSize(jobConfig.content);
  const isSmallDocx = isDocx && docSize <= SIZE_THRESHOLD;

  // AWS can handle small DOCX natively via translateDocument API
  if (jobConfig.engine === "aws" && isSmallDocx) {
    return handleAwsDocument(jobConfig);
  }

  // DOCX needs batch extraction (LLM or large AWS)
  if (isDocx) {
    return handleDocxBatch(jobConfig);
  }

  // Plain text/HTML - simple translation
  return handleTextTranslation(jobConfig);
}

async function handleAwsDocument(jobConfig) {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: jobConfig.content,
      contentType: jobConfig.contentType,
      sourceLanguage: jobConfig.sourceLanguage,
      targetLanguage: jobConfig.languageCode,
    }),
  });
  if (!res.ok) throw new Error(`Translation request failed. (${res.status})`);
  const data = await res.json();

  if (typeof data === "string" && data.startsWith("data:")) {
    const base64Response = await fetch(data);
    return await base64Response.blob();
  }
  return new Blob([data || ""], { type: "text/plain" });
}

async function handleDocxBatch(jobConfig) {
  const docxBuffer = base64ToArrayBuffer(jobConfig.content);
  const options = {
    sourceLang: jobConfig.sourceLanguage,
    targetLang: jobConfig.languageCode,
    formality: "formal",
    profanityMask: true,
    brevity: false,
  };

  const translateBatchFn = async (texts) => translateBatch(texts, jobConfig.engine, options);

  const translatedDocx = await translateDocx(docxBuffer, translateBatchFn, {
    batchSize: 50,
    includeHeaders: true,
    includeFootnotes: true,
    includeComments: false,
  });

  return new Blob([translatedDocx], { type: DOCX_MIME_TYPE });
}

async function handleTextTranslation(jobConfig) {
  const options = {
    sourceLang: jobConfig.sourceLanguage,
    targetLang: jobConfig.languageCode,
    formality: "formal",
    profanityMask: true,
    brevity: false,
  };

  const [translated] = await translateBatch([jobConfig.inputText], jobConfig.engine, options);
  return new Blob([translated || ""], { type: "text/plain" });
}
// #endregion

// #region Component
export default function Page() {
  const { user } = useAuthContext();
  const [sourceFiles, setSourceFiles] = createSignal([]);
  const [targetLanguages, setTargetLanguages] = createSignal([]);
  const [engine, setEngine] = createSignal("aws");
  const [store, setStore] = createStore(structuredClone(defaultStore));

  // #region Session Persistence
  const { setParam, createSession, saveSession } = useSessionPersistence({
    dbPrefix: "arti-translator",
    store,
    setStore,
    defaultStore,
    getSnapshot: () => ({
      sourceFiles: sourceFiles(),
      targetLanguages: targetLanguages(),
      engine: engine(),
    }),
    restoreSnapshot: (snap) => {
      setSourceFiles(Array.isArray(snap.sourceFiles) ? snap.sourceFiles : []);
      setTargetLanguages(Array.isArray(snap.targetLanguages) ? snap.targetLanguages : []);
      setEngine(snap.engine || "aws");
    },
    onRetryJob: retryJob,
  });
  // #endregion

  // #region Job Processing
  const allJobsProcessed = createMemo(() => {
    const jobs = store.generatedDocuments;
    const jobKeys = Object.keys(jobs);
    return (
      jobKeys.length === 0 || jobKeys.every((k) => ["completed", "error"].includes(jobs[k]?.status))
    );
  });

  async function processJob(jobId, jobConfig) {
    setStore("generatedDocuments", jobId, {
      status: "processing",
      blob: null,
      error: null,
      config: jobConfig,
    });
    await saveSession();

    try {
      const blob = await translateDocument(jobConfig);
      setStore("generatedDocuments", jobId, {
        status: "completed",
        blob,
        error: null,
        config: jobConfig,
      });
    } catch (error) {
      setStore("generatedDocuments", jobId, {
        status: "error",
        blob: null,
        error: error?.message || "Translation error",
        config: jobConfig,
      });
    } finally {
      await saveSession();
    }
  }

  async function retryJob(jobId) {
    const job = store.generatedDocuments[jobId];
    if (job?.config) await processJob(jobId, job.config);
  }

  function downloadJob(jobId) {
    const job = store.generatedDocuments[jobId];
    if (!job || job.status !== "completed" || !job.blob) return;

    const timestamp = createTimestamp();
    const baseFilename = job.config.displayInfo.filename.replace(/\.[^.]+$/i, "");
    const baseExtension = job.config.displayInfo.filename.split(".").pop();
    downloadBlob(`${baseFilename}-${timestamp}.${baseExtension}`, job.blob);
  }

  function downloadAll() {
    Object.keys(store.generatedDocuments).forEach((jobId) => {
      const job = store.generatedDocuments[jobId];
      if (job?.status === "completed" && job.blob) downloadJob(jobId);
    });
  }
  // #endregion

  // #region Event Handlers
  function handleFileSelect(event) {
    const files = event.target.files;
    if (files?.length > 0) {
      setSourceFiles(Array.from(files));
      setStore("generatedDocuments", store.generatedDocuments);
    }
  }

  function handleReset(event) {
    event.preventDefault();
    setSourceFiles([]);
    setTargetLanguages([]);
    setEngine("aws");
    setStore(structuredClone(defaultStore));
    setParam("id", null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (sourceFiles().length === 0 || targetLanguages().length === 0) return;

    setStore("generatedDocuments", reconcile({}, { merge: true }));
    const id = await createSession();
    setStore("id", id);
    setParam("id", id);
    await saveSession();

    for (const file of sourceFiles()) {
      try {
        const bytes = await file.arrayBuffer();
        const inputText = await parseDocument(bytes, file.type, file.name);

        for (const langCode of targetLanguages()) {
          const jobId = crypto.randomUUID();
          const jobConfig = {
            languageCode: langCode,
            languageLabel: getLanguageLabel(langCode),
            sourceLanguage: AUTO_LANGUAGE.value || "en",
            inputText: inputText || "",
            content: await readFile(file, "dataURL"),
            contentType: file.type || "text/plain",
            engine: engine(),
            displayInfo: {
              prefix: langCode.toUpperCase(),
              label: getLanguageLabel(langCode),
              filename: makeFilename(file?.name, langCode),
            },
          };
          processJob(jobId, jobConfig);
        }
      } catch (error) {
        console.error(`Failed to process file ${file?.name}:`, error);
      }
    }
  }

  function onTargetLanguageChange(e, option) {
    const checked = e?.target?.checked || false;
    setTargetLanguages((prev) =>
      checked ? prev.concat([option.value]) : prev.filter((v) => v !== option.value)
    );
  }

  const languageColumns = () => {
    const cols = [];
    for (let i = 0; i < LANGUAGES.length; i += ROWS_PER_COLUMN) {
      cols.push(LANGUAGES.slice(i, i + ROWS_PER_COLUMN));
    }
    return cols;
  };
  // #endregion

  // #region Template
  return html`
    <div class="bg-info-subtle h-100 position-relative">
      <div class="container py-3">
        <form
          id="translateForm"
          onSubmit=${handleSubmit}
          onReset=${handleReset}
          class="container p-0"
        >
          <div class="row align-items-stretch mb-3 text-center">
            <div class="col">
              <div class="bg-white shadow border rounded p-3">
                <h1 class="fw-bold fs-3 form-label mt-3 mb-2">Document Translator</h1>
                <p class="mb-4 text-body-secondary">
                  Easily translate your documents into multiple languages and generate accurate
                  translations in seconds.
                </p>
              </div>
            </div>
          </div>

          <div class="row align-items-stretch">
            <div class="col-md-6 mb-2">
              <div class="position-relative w-100">
                <div class="bg-white shadow border rounded p-3 card-lg">
                  <div class="row">
                    <div class="col-sm-12 mb-2">
                      <label for="inputText" class="form-label required text-info fs-5 mb-1"
                        >Source Documents</label
                      >
                      <${FileInput}
                        id="fileInput"
                        value=${() => sourceFiles()}
                        onChange=${handleFileSelect}
                        multiple=${true}
                        accept=".txt, .docx, .html"
                        class="form-control form-control-sm mb-3"
                      />
                    </div>

                    <div class="col-sm-12 mb-4">
                      <div class="d-flex justify-content-start align-items-center flex-wrap gap-2">
                        <label for="targetLanguage" class="form-label required text-info fs-5 mb-1"
                          >Target Languages</label
                        >
                        <${Show} when=${() => user?.()?.Role?.name === "admin"}>
                          <select
                            class="form-select form-select-sm w-auto mb-1"
                            aria-label="Translation engine"
                            value=${() => engine()}
                            onChange=${(e) => setEngine(e.target.value)}
                          >
                            <option value="aws">AWS Translate</option>
                            ${MODELS.map((m) => html`<option value=${m.value}>${m.label}</option>`)}
                          </select>
                        <//>
                      </div>

                      <div class="border rounded p-3 pb-5">
                        <div class="row">
                          <${For} each=${languageColumns()}>
                            ${(col) => html`
                              <div class="col-sm-3">
                                <${For} each=${col}>
                                  ${(option) => html`
                                    <div class="mb-1">
                                      <div
                                        class="form-check form-control-sm min-height-auto py-0 ms-1"
                                      >
                                        <input
                                          class="form-check-input cursor-pointer"
                                          type="checkbox"
                                          id=${() => option.value}
                                          checked=${() => targetLanguages()?.includes(option.value)}
                                          onChange=${(e) => onTargetLanguageChange(e, option)}
                                        />
                                        <label
                                          class="form-check-label cursor-pointer text-nowrap"
                                          classList=${() => ({ "text-muted": option.disabled })}
                                          for=${() => option.value}
                                        >
                                          ${() => option.label}
                                        </label>
                                      </div>
                                    </div>
                                  `}
                                <//>
                              </div>
                            `}
                          <//>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="d-flex-center gap-1 mt-2">
                  <button type="reset" class="btn btn-wide btn-wide-info px-3 py-3">Reset</button>
                  <button
                    class="btn btn-wide px-3 py-3 btn-wide-primary"
                    id="translateButton"
                    type="submit"
                  >
                    Generate
                  </button>
                </div>
              </div>
            </div>

            <div class="col-md-6 d-flex" style="margin-bottom: 66px !important;">
              <div
                class="d-flex flex-column bg-white shadow border rounded p-3 flex-fill h-100 card-lg"
              >
                <${Show}
                  when=${() => Object.keys(store.generatedDocuments).length > 0}
                  fallback=${html`
                    <div class="d-flex h-100 py-5">
                      <div class="text-center py-5">
                        <h1 class="text-info mb-3">Welcome to Document Translator</h1>
                        <div>
                          To get started, upload your source documents, select one or more target
                          languages from the list, and click Generate to create translated versions.
                        </div>
                      </div>
                    </div>
                  `}
                >
                  <div class="d-flex flex-column gap-2">
                    <div class="text-muted small fw-semibold">
                      <${Show}
                        when=${allJobsProcessed}
                        fallback="We are generating your forms now. This may take a few moments."
                      >
                        <span
                          >All processing is complete. The generated documents are available for
                          download.</span
                        >
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
                                <span>${() => job().config?.displayInfo?.label || "Unknown"}</span>
                              </div>
                              <div class="small text-muted">
                                ${() =>
                                  job().config?.displayInfo?.filename || "translated_text.txt"}
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
        </form>
      </div>
    </div>
  `;
  // #endregion
}
// #endregion
