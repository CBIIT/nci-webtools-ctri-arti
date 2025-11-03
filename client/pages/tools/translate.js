import { createMemo, createSignal, For, Show } from "solid-js";
import html from "solid-js/html";

import { createStore } from "solid-js/store";

import FileInput from "../../components/file-input.js";
import { useAuthContext } from "../../contexts/auth-context.js";
import { MODEL_OPTIONS } from "../../models/model-options.js";
import { parseDocument } from "../../utils/parsers.js";

import { useSessionPersistence } from "./translate/hooks.js";

const AUTO_LANGUAGE = { value: "auto", label: "Auto" };
const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "zh", label: "Chinese" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
];

const MODELS = [
  { value: MODEL_OPTIONS.AWS_BEDROCK.TITAN.v1_0_lite, label: "Model: Titan" },
  { value: MODEL_OPTIONS.AWS_BEDROCK.COHERE_COMMAND.v1_0_light, label: "Model: Cohere Command" },
  { value: MODEL_OPTIONS.AWS_BEDROCK.HAIKU.v4_5, label: "Model: Haiku" },
  { value: MODEL_OPTIONS.AWS_BEDROCK.SONNET.v4_5, label: "Model: Sonnet" },
  { value: MODEL_OPTIONS.AWS_BEDROCK.OPUS.v4_1, label: "Model: Opus" },
];

const defaultStore = { id: null, generatedDocuments: {} };

export default function Page() {
  const { user } = useAuthContext();
  const [sourceText, setSourceText] = createSignal("");
  const [targetLanguages, setTargetLanguages] = createSignal([]);
  const [inputFile, setInputFile] = createSignal(null);
  const [engine, setEngine] = createSignal("aws");
  const [store, setStore] = createStore(structuredClone(defaultStore));

  const { setParam, createSession, saveSession } = useSessionPersistence({
    dbPrefix: "arti-translator",
    store,
    setStore,
    defaultStore,
    getSnapshot: () => ({
      inputFile: inputFile(),
      inputText: sourceText(),
      targetLanguages: targetLanguages(),
      engine: engine(),
    }),
    restoreSnapshot: (snap) => {
      setInputFile(snap.inputFile || null);
      setSourceText(snap.inputText || "");
      setTargetLanguages(Array.isArray(snap.targetLanguages) ? snap.targetLanguages : []);
      setEngine(snap.engine || "aws");
    },
    onRetryJob: retryJob,
  });

  const allJobsProcessed = createMemo(() => {
    const jobs = store.generatedDocuments;
    const keys = Object.keys(jobs);
    if (keys.length === 0) return true;
    return keys.every((k) => ["completed", "error"].includes(jobs[k]?.status));
  });

  function getLanguageLabel(code) {
    return LANGUAGES.find((l) => l.value === code)?.label || code.toUpperCase();
  }

  function makeFilename(originalName, langCode) {
    const base = (originalName || "translated_text").replace(/\.[^/.]+$/, "");
    return `${base}-${langCode}.txt`;
  }

  async function translateRequest({ text, sourceLanguage, targetLanguage }) {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, sourceLanguage, targetLanguage }),
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

      const blob = new Blob([translated], { type: "text/plain" });

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
    if (!job?.config) return;

    await processJob(jobId, job.config);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function downloadJob(jobId) {
    const job = store.generatedDocuments[jobId];
    if (!job || job.status !== "completed" || !job.blob) return;

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

    const baseFilename = job.config.displayInfo.filename.replace(/\.txt$/i, "");
    const filename = `${baseFilename}-${timestamp}.txt`;

    triggerDownload(job.blob, filename);
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
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    setInputFile(file);

    const reader = new FileReader();
    reader.onload = async function (e) {
      const bytes = e.target.result;
      const text = await parseDocument(bytes, file.type, file.name);
      setSourceText(text || "");
      setStore("generatedDocuments", store.generatedDocuments);
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleReset(event) {
    event.preventDefault();
    setSourceText("");
    setTargetLanguages([]);
    setInputFile(null);
    setEngine("aws");
    setStore(structuredClone(defaultStore));
    setParam("id", null);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!inputFile() || targetLanguages().length === 0) {
      return;
    }

    let inputText = sourceText();
    if (!inputText) {
      const bytes = await inputFile().arrayBuffer();
      inputText = await parseDocument(bytes, inputFile().type, inputFile().name);
      setSourceText(inputText || "");
    }

    // Clear previous results
    setStore("generatedDocuments", {});

    const id = await createSession();
    setStore("id", id);
    setParam("id", id);
    await saveSession();

    for (const langCode of targetLanguages()) {
      const jobId = crypto.randomUUID();
      const jobConfig = {
        languageCode: langCode,
        languageLabel: getLanguageLabel(langCode),
        sourceLanguage: AUTO_LANGUAGE.value || "en",
        inputText: inputText || "",
        engine: engine(),
        displayInfo: {
          prefix: langCode.toUpperCase(),
          label: getLanguageLabel(langCode),
          filename: makeFilename(inputFile()?.name, langCode),
        },
      };
      processJob(jobId, jobConfig);
    }
  }

  function onTargetLanguageChange(e, option) {
    const checked = e?.target?.checked || false;
    setTargetLanguages((prev) =>
      checked ? prev.concat([option.value]) : prev.filter((v) => v !== option.value)
    );
  }

  const ROWS_PER_COLUMN = 4;
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
          class="container"
        >
          <div class="row align-items-stretch my-3 text-center">
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
              <div class="d-flex flex-column bg-white shadow border rounded p-3 flex-grow-1">
                <div class="row">
                  <div class="col-sm-12 mb-2">
                    <label for="inputText" class="form-label required text-info fs-5 mb-1"
                      >Source Document</label
                    >
                    <${FileInput}
                      id="fileInput"
                      value=${() => [inputFile()]}
                      onChange=${handleFileSelect}
                      accept=".txt, .docx, .pdf"
                      class="form-control form-control-sm mb-3"
                    />
                  </div>

                  <div class="col-sm-12 mb-4">
                    <div class="d-flex justify-content-start align-items-center gap-2">
                      <label for="targetLanguage" class="form-label required text-info fs-5 mb-1">
                        Target Languages
                      </label>

                      <${Show} when=${() => user?.()?.Role?.name === "admin"}>
                        <select
                          class="form-select form-select-sm w-auto"
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
            </div>

            <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
              <div class="d-flex flex-column bg-white shadow border rounded p-3 flex-grow-1">
                <${Show}
                  when=${() => Object.keys(store.generatedDocuments).length > 0}
                  fallback=${html`<div class="d-flex h-100 py-5">
                    <div class="text-center py-5">
                      <h1 class="text-info mb-3">Welcome to Document Translator</h1>
                      <div>
                        To get started, upload your source document, select one or more target
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
                                <span>${() => job().config?.displayInfo?.prefix || ""}</span>
                                <span class="text-muted fw-normal">
                                  : ${() => job().config?.displayInfo?.label || "Unknown"}</span
                                >
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

            <div class="col-sm-6 mb-4">
              <div class="d-flex-center mt-1 gap-1">
                <button type="reset" class="btn btn-wide btn-wide-info px-3 py-3">Cancel</button>

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
        </form>
      </div>
    </div>
  `;
}
