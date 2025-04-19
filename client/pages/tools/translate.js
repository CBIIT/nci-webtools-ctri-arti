import html from "solid-js/html";
import { createSignal, createResource } from "solid-js";
import { parseDocument } from "/utils/parsers.js";

export default function Page() {
  const [languages] = createResource(getLanguages);
  const [sourceText, setSourceText] = createSignal("");
  const [targetText, setTargetText] = createSignal("");
  const [sourceLanguage, setSourceLanguage] = createSignal("en");
  const [targetLanguage, setTargetLanguage] = createSignal("es");

  async function getLanguages() {
    const response = await fetch("/api/translate/languages");
    return await response.json();
  }

  async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async function (e) {
        const bytes = e.target.result;
        const text = await parseDocument(bytes, file.type, file.name);
        setSourceText(text);
      };
      reader.readAsArrayBuffer(file);
    }
  }

  async function handleDownload() {
    const blob = new Blob([targetText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "translated_text.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleSwap() {
    let tempSourceLanguage = sourceLanguage();
    let tempTargetLanguage = targetLanguage();
    if (tempSourceLanguage === "auto") {
      tempSourceLanguage = "en";
    }
    setSourceLanguage(tempTargetLanguage);
    setTargetLanguage(tempSourceLanguage);
    setSourceText(targetText());
    setTargetText("");
  }


  async function handleReset(event) {
    event.preventDefault();
    setSourceText("");
    setTargetText("");
    setSourceLanguage("en");
    setTargetLanguage("es");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setTargetText("Translating...");

    // Call the translation API
    try {
      const params = {
        text: sourceText(),
        sourceLanguage: sourceLanguage(),
        targetLanguage: targetLanguage(),
      };

      const response = await fetch("/api/translate", {
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
      setTargetText(data);
    } catch (error) {
      console.error(error);
      setTargetText("An error occurred while translating the text.");
    }
  }
  return html`

    <form id="translateForm" onSubmit=${(ev) => handleSubmit(ev)} onReset=${handleReset} class="container">
      <h1 class="fw-bold text-gradient my-3">Translator</h1>

      <div class="row align-items-stretch">
        <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
          <label for="inputText" class="form-label">Source Text</label>
          <input type="file" id="fileInput" class="form-control form-control-sm border-bottom-0 rounded-bottom-0" accept=".txt, .docx, .pdf" onChange=${handleFileSelect} />
          <textarea
            class="form-control form-control-sm rounded-top-0 flex-grow-1"
            id="inputText"
            rows="8"
            placeholder="Enter text to translate or choose a file above"
            value=${sourceText}
            onChange=${(e) => setSourceText(e.target.value)}
            required />
        </div>
        <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
          <label for="translationResult" class="form-label">Translated Text</label>
          <textarea
            class="form-control form-control-sm flex-grow-1"
            id="translationResult"
            rows="10"
            placeholder="Submit text to view translation results"
            value=${targetText}
            readonly />
        </div>
      </div>

      <div class="row">
        <div class="col-md-6 mb-2">
          <label for="sourceLanguage" class="form-label">Select Source Language</label>
          <select
            class="form-select form-select-sm"
            id="sourceLanguage"
            name="sourceLanguage"
            value=${sourceLanguage}
            onChange=${(e) => setSourceLanguage(e.target.value)}
            required>
            <option value="" hidden>Select a source language</option>
            ${() =>
              languages()?.map(
                (lang) => html`<option value=${lang.value} selected=${() => lang.value === sourceLanguage()}>${lang.label}</option>`
              )}
          </select>
        </div>

        <div class="col-md-6 mb-2">
          <label for="targetLanguage" class="form-label">Select Target Language</label>
          <select
            class="form-select form-select-sm"
            id="targetLanguage"
            name="targetLanguage"
            value=${targetLanguage}
            onChange=${(e) => setTargetLanguage(e.target.value)}
            required>
            <option value="" hidden>Select a target language</option>
            ${() =>
              languages()?.filter(lang => lang.value !== "auto")?.map(
                (lang) => html`<option value=${lang.value} selected=${() => lang.value === targetLanguage()}>${lang.label}</option>`
              )}
          </select>
        </div>
      </div>

      <div class="row">
        <div class="col mb-2">
          <div class="text-end">
            <button class="btn btn-sm btn-outline-danger me-1" id="clearButton" type="reset">Clear</button>
            <button class="btn btn-sm btn-outline-secondary me-1" id="swapButton" type="button" onClick=${handleSwap}>Swap</button>
            <button class="btn btn-sm btn-outline-primary me-1" id="translateButton" type="submit">Translate</button>
            <button class="btn btn-sm btn-outline-dark" id="downloadButton" type="button" onClick=${handleDownload}>Download</button>
          </div>
        </div>
      </div>
    </form>
  `;
}
