import { createMemo, createSignal, For, Show } from "solid-js";
import html from "solid-js/html";

import { createStore, reconcile } from "solid-js/store";

import FileInput from "../../../components/file-input.js";
import { useAuthContext } from "../../../contexts/auth-context.js";
import { MODEL_OPTIONS } from "../../../models/model-options.js";
import { createTimestamp, downloadBlob } from "../../../utils/files.js";
import { parseDocument } from "../../../utils/parsers.js";
import { useSessionPersistence } from "../translate/hooks.js";

const AUTO_LANGUAGE = { value: "auto", label: "Auto" };
const LANGUAGES = [
  { value: "es-MX", label: "Spanish" },
  { value: "ar", label: "Arabic" },
  { value: "fr", label: "French" },
  { value: "am", label: "Amharic" },
  { value: "pt", label: "Portuguese" },
  { value: "vi", label: "Vietnamese" },
];
const ROWS_PER_COLUMN = 4;

const MODELS = [
  { value: MODEL_OPTIONS.AWS_BEDROCK.HAIKU.v4_5, label: "Model: Haiku" },
  { value: MODEL_OPTIONS.AWS_BEDROCK.SONNET.v4_5, label: "Model: Sonnet" },
  { value: MODEL_OPTIONS.AWS_BEDROCK.OPUS.v4_5, label: "Model: Opus" },
];

const defaultStore = { id: null, generatedDocuments: {} };

export default function Page() {
  const { user } = useAuthContext();
  const [sourceFiles, setSourceFiles] = createSignal([]);
  const [targetLanguages, setTargetLanguages] = createSignal([]);
  const [engine, setEngine] = createSignal("aws");
  const [store, setStore] = createStore(structuredClone(defaultStore));

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

  const allJobsProcessed = createMemo(() => {
    const jobs = store.generatedDocuments;
    const jobKeys = Object.keys(jobs);
    if (jobKeys.length === 0) {
      return true;
    }

    return jobKeys.every((k) => ["completed", "error"].includes(jobs[k]?.status));
  });

  function getLanguageLabel(code) {
    return LANGUAGES.find((l) => l.value === code)?.label || code.toUpperCase();
  }

  function makeFilename(originalName, langCode) {
    const ext = originalName?.split(".").pop() || "txt";
    const base = (originalName || "translated_text").replace(/\.[^/.]+$/, "");
    return `${base}-${langCode}.${ext}`;
  }

  async function translateRequest({ text, content, contentType, sourceLanguage, targetLanguage }) {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, content, contentType, sourceLanguage, targetLanguage }),
    });

    if (!response.ok) {
      throw new Error(`Translation request failed. (${response.status})`);
    }

    const data = await response.json();

    if (typeof data !== "string") {
      return "";
    }

    return data;
  }

  async function runModel(params) {
    const res = await fetch("/api/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      throw new Error(`Translation request failed. (${res.status})`);
    }

    const data = await res.json();

    return data?.output?.message?.content?.map((c) => c.text || "").join(" ") || "";
  }

  async function modelTranslateRequest({ text, sourceLanguage, targetLanguage, model }) {
    const targetLabel = getLanguageLabel(targetLanguage);
    const system = [
      "You are a translation engine emulating Amazon Translate.",
      sourceLanguage && sourceLanguage !== "auto"
        ? `Translate from ${sourceLanguage.toUpperCase()} to ${targetLabel}.`
        : `Detect the source language and translate to ${targetLabel}.`,
      "Translate confidently translatable words and phrases.",
      "If a token/segment is untranslatable or nonsensical (e.g., random strings, mixed gibberish, unknown product codes, IDs, URLs/email addresses, emojis, hashtags, or placeholders), LEAVE IT UNCHANGED.",
      "Preserve punctuation, whitespace, line breaks, capitalization, numerals, units, and any inline placeholders exactly as in the source.",
      "Do not add, remove, or paraphrase content; do not guess missing words.",
      "It is acceptable to partially translate a sentence while keeping untranslatable tokens as-is.",
      "Output ONLY the translated text (plain text), with no quotes or explanations.",
    ]
      .filter(Boolean)
      .join(" ");

    const params = {
      model,
      messages: [{ role: "user", content: [{ text }] }],
      system,
      stream: false,
    };

    const output = await runModel(params);
    return (output || "").trim();
  }

  async function processJob(jobId, jobConfig) {
    setStore("generatedDocuments", jobId, {
      status: "processing",
      blob: null,
      error: null,
      config: jobConfig,
    });

    await saveSession();

    try {
      let translated = "";
      if (jobConfig.engine === "aws") {
        translated = await translateRequest({
          text: jobConfig.inputText,
          content: jobConfig.content,
          contentType: jobConfig.contentType,
          sourceLanguage: jobConfig.sourceLanguage,
          targetLanguage: jobConfig.languageCode,
        });
      } else {
        translated = await modelTranslateRequest({
          text: jobConfig.inputText,
          sourceLanguage: jobConfig.sourceLanguage,
          targetLanguage: jobConfig.languageCode,
          model: jobConfig.engine,
        });
      }

      let blob;
      if (translated.startsWith("data:")) {
        const base64Response = await fetch(translated);
        blob = await base64Response.blob();
      } else {
        blob = new Blob([translated], { type: "text/plain" });
      }

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
    if (!job?.config) {
      return;
    }

    await processJob(jobId, job.config);
  }

  async function downloadJob(jobId) {
    const job = store.generatedDocuments[jobId];
    if (!job || job.status !== "completed" || !job.blob) {
      return;
    }

    const timestamp = createTimestamp();
    const baseFilename = job.config.displayInfo.filename.replace(/\.[^.]+$/i, "");
    const baseExtension = job.config.displayInfo.filename.split(".").pop();
    const filename = `${baseFilename}-${timestamp}.${baseExtension}`;

    downloadBlob(filename, job.blob);
  }

  function downloadAll() {
    Object.keys(store.generatedDocuments).forEach((jobId) => {
      const job = store.generatedDocuments[jobId];
      if (job?.status === "completed" && job.blob) {
        downloadJob(jobId);
      }
    });
  }

  async function handleFileSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const fileArray = Array.from(files);
    setSourceFiles(fileArray);
    setStore("generatedDocuments", store.generatedDocuments);
  }

  async function handleReset(event) {
    event.preventDefault();
    setSourceFiles([]);
    setTargetLanguages([]);
    setEngine("aws");
    setStore(structuredClone(defaultStore));
    setParam("id", null);
  }

  function readFile(file, type = "text") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      if (type === "arrayBuffer") {
        reader.readAsArrayBuffer(file);
      } else if (type === "text") {
        reader.readAsText(file);
      } else if (type === "dataURL") {
        reader.readAsDataURL(file);
      } else {
        reject(new Error("Unsupported read type"));
      }
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (sourceFiles().length === 0 || targetLanguages().length === 0) {
      return;
    }

    setStore("generatedDocuments", reconcile({}, { merge: true }));
    const id = await createSession();
    setStore("id", id);
    setParam("id", id);
    await saveSession();

    for (const file of sourceFiles()) {
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

  return html`
    <div class="bg-info-subtle h-100 position-relative">
      <div class="container py-3">
        <form
          id="translateForm"
          onSubmit=${(ev) => handleSubmit(ev)}
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
                        <label for="targetLanguage" class="form-label required text-info fs-5 mb-1">
                          Target Languages
                        </label>

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
                                          class="form-check-label cursor-pointer"
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
                  fallback=${html`<div class="d-flex h-100 py-5">
                    <div class="text-center py-5">
                      <h1 class="text-info mb-3">Welcome to Document Translator</h1>
                      <div>
                        To get started, upload your source documents, select one or more target
                        languages from the list, and click Generate to create translated versions.
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
                        <span>
                          All processing is complete. The generated documents are available for
                          download.
                        </span>
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
}
