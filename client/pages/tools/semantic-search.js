import { createMemo, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import html from "solid-js/html";
import { pipeline } from "@huggingface/transformers";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HNSW } from "/utils/hnsw.js";
import { createEmbedder } from "/utils/similarity.js";

// Utility function to read file as text
const readFile = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsText(file);
  });

// Memoizable search pipeline factory
const createSearchPipeline = async (files, settings) => {
  if (!files.length) return null;

  window.embedder ||= await pipeline("feature-extraction", "onnx-community/Qwen3-Embedding-0.6B-ONNX", {
      revision: "main",
      device: navigator.gpu ? "webgpu" : undefined,
      dtype: "q4f16",
  });

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: settings.chunkSize,
    chunkOverlap: settings.chunkOverlap,
    keepSeparator: true,
  });

  // Process files and create chunks
  const chunks = [];
  for (const file of files) {
    const content = await readFile(file);
    const fileChunks = await splitter.splitText(content);
    chunks.push(
      ...fileChunks.map((text, idx) => ({
        id: `${file.name}-${idx}`,
        text,
        source: file.name,
      }))
    );
  }

  // Generate embeddings
  const batchSize = 5;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const embeddings = await embedder(batch.map((c) => c.text));
    batch.forEach((chunk, j) => (chunk.embedding = embeddings[j]));
  }

  // Build HNSW index
  const index = new HNSW(settings.hnswParams.M, settings.hnswParams.efConstruction, chunks[0].embedding.length, "cosine");
  await index.buildIndex(chunks.map((c) => ({ id: c.id, vector: c.embedding })));

  // Return search function
  return async (query, limit = 5) => {
    const [queryEmbedding] = await embedder([query]);
    const results = index.searchKNN(queryEmbedding, limit);
    return results.map((r) => ({
      ...chunks.find((c) => c.id === r.id),
      similarity: r.score,
    }));
  };
};

// App component
export default function Page() {
  const [state, setState] = createStore({
    files: [],
    query: "",
    results: [],
    loading: false,
    status: "",
    settings: {
      chunkSize: 1000,
      chunkOverlap: 200,
      hnswParams: { M: 16, efConstruction: 200 },
      model: "onnx-community/Qwen3-Embedding-0.6B-ONNX",
    },
  });

  // Memoized search function
  const searchFn = createMemo(async () => {
    const filesKey = state.files.map((f) => `${f.name}-${f.size}-${f.lastModified}`).join("|");
    const settingsKey = JSON.stringify(state.settings);

    // This will only recompute when files or settings change
    setState("loading", true);
    setState("status", "Indexing");

    try {
      const fn = await createSearchPipeline(state.files, state.settings);
      setState("loading", false);
      setState("status", fn ? "Ready" : "Upload files to search");
      return fn;
    } catch (error) {
      setState("loading", false);
      setState("status", `Error: ${error.message}`);
      return null;
    }
  });

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files);
    if (files.length) setState("files", files);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    const search = await searchFn();
    if (!search || !state.query) return;

    setState("loading", true);
    try {
      const results = await search(state.query, 5);
      setState("results", results);
    } catch (error) {
      alert(`Search error: ${error.message}`);
    }
    setState("loading", false);
  };

  const handleReset = (e) => {
    e.preventDefault();
    setState({
      files: [],
      query: "",
      results: [],
      loading: false,
      status: "",
    });
    e.target.fileInput.value = "";
  };

  const placeholder = createMemo(() => {
    if (!state.files.length) return "Upload documents to search";
    if (state.files.length <= 5) return `Search in ${state.files.map((f) => f.name).join(", ")}`;
    return `Search in ${state.files.length} files`;
  });

  return html`
    <div class="container py-4">
      <header class="mb-4 text-center">
        <h1>Semantic Search</h1>
        <p class="text-muted">Upload documents, then search using natural language queries</p>
      </header>

      <div class="container px-4 py-2">
        <div class="mb-4">
          <form onSubmit=${handleSearch} onReset=${handleReset}>
            <div class="input-group mb-3">
              <label for="fileInput" class="btn btn-secondary">Upload</label>
              <input type="file" id="fileInput" name="fileInput" onInput=${handleFileInput} accept="text/*,.docx,.doc,.pdf" multiple hidden />
              <input
                type="search"
                class="form-control"
                value=${() => state.query}
                onInput=${(e) => setState("query", e.target.value)}
                placeholder=${placeholder}
                disabled=${() => state.loading} />
              <button type="reset" class="btn btn-outline-secondary">Reset</button>
              <button type="submit" class="btn btn-primary" disabled=${() => state.loading}>
                <${Show} when=${() => state.loading} fallback="Search">
                  <span class="spinner-border spinner-border-sm me-2"></span>
                  <span>${() => state.status}</span>
                <//>
              </button>
            </div>

            <details class="mb-3">
              <summary class="small mb-2">Settings</summary>
              <div class="row g-2 mb-3">
                <div class="col">
                  <label class="small">Model Name</label>
                  <input
                    type="text"
                    class="form-control form-control-sm"
                    value=${() => state.settings.model}
                    onInput=${(e) => setState("settings", "model", e.target.value)} />
                </div>
                <div class="col">
                  <label class="small">Chunk Size</label>
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    value=${() => state.settings.chunkSize}
                    onInput=${(e) => setState("settings", "chunkSize", parseInt(e.target.value))} />
                </div>
                <div class="col">
                  <label class="small">Chunk Overlap</label>
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    value=${() => state.settings.chunkOverlap}
                    onInput=${(e) => setState("settings", "chunkOverlap", parseInt(e.target.value))} />
                </div>
              </div>
            </details>
          </form>
        </div>

        <div class="mb-4">
          <div class="list-group list-group-flush">
            <${For} each=${() => state.results}>
              ${(result) => html`
                <div class="list-group-item border-0 px-0">
                  <div class="d-flex justify-content-between align-items-center mb-1">
                    <h6 class="mb-0 text-truncate">${result.source}</h6>
                    <span class="badge bg-info text-white"> ${(result.similarity * 100).toFixed(1)}% </span>
                  </div>
                  <p class="mb-0 text-muted">${result.text}</p>
                </div>
              `}
            <//>
          </div>
        </div>
      </div>
    </div>
  `;
}
