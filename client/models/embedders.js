import { HNSW } from "../utils/hnsw.js";

/**
 * Base embedder interface
 */
export class BaseEmbedder {
  constructor(dimensions = 512) {
    this.dimensions = dimensions;
  }

  /**
   * Generate embedding for text
   * @param {string} text
   * @returns {Promise<Float32Array>}
   */
  async embed(text) {
    throw new Error("embed method must be implemented");
  }

  /**
   * Get embedder metadata
   * @returns {object}
   */
  getMetadata() {
    return {
      name: this.constructor.name,
      dimensions: this.dimensions,
      version: "1.0.0",
    };
  }
}

/**
 * Simple test embedder that maps bytes to numeric arrays
 * Useful for testing similarity search without external dependencies
 */
export class TestEmbedder extends BaseEmbedder {
  constructor(dimensions = 128) {
    super(dimensions);
  }

  async embed(text) {
    if (!text || typeof text !== "string") {
      return new Float32Array(this.dimensions);
    }

    // Convert text to bytes (Node.js compatible)
    let bytes;
    if (typeof TextEncoder !== "undefined") {
      const encoder = new TextEncoder();
      bytes = encoder.encode(text);
    } else if (typeof Buffer !== "undefined") {
      bytes = Buffer.from(text, "utf8");
    } else {
      // Fallback: convert to char codes
      bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) {
        bytes[i] = text.charCodeAt(i) & 0xff;
      }
    }

    // Create embedding array
    const embedding = new Float32Array(this.dimensions);

    // Fill with normalized byte values, cycling through if text is shorter
    for (let i = 0; i < this.dimensions; i++) {
      const byteIndex = i % bytes.length;
      // Normalize byte value to [-1, 1] range
      embedding[i] = (bytes[byteIndex] - 127.5) / 127.5;
    }

    return embedding;
  }

  getMetadata() {
    return {
      ...super.getMetadata(),
      type: "test",
      description: "Simple byte-based embedder for testing",
    };
  }
}

/**
 * Placeholder for Transformers.js embedder
 * Would use models like all-MiniLM-L6-v2 in production
 */
export class TransformersEmbedder extends BaseEmbedder {
  constructor(model = "Xenova/all-MiniLM-L6-v2", dimensions = 384) {
    super(dimensions);
    this.model = model;
    this.pipeline = null;
  }

  async init() {
    // In production, would initialize Transformers.js pipeline
    // const { pipeline } = await import('@xenova/transformers');
    // this.pipeline = await pipeline('feature-extraction', this.model);
    throw new Error("TransformersEmbedder not implemented - requires @xenova/transformers");
  }

  async embed(text) {
    if (!this.pipeline) {
      await this.init();
    }

    // In production, would use:
    // const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
    // return new Float32Array(output.data);

    throw new Error("TransformersEmbedder not implemented");
  }

  getMetadata() {
    return {
      ...super.getMetadata(),
      type: "transformers",
      model: this.model,
      description: "Client-side Transformers.js embedder",
    };
  }
}

/**
 * API-based embedder for server-side models
 */
export class APIEmbedder extends BaseEmbedder {
  constructor(endpoint, apiKey = null, dimensions = 1536) {
    super(dimensions);
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  async embed(text) {
    const headers = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`API embedder failed: ${response.statusText}`);
    }

    const data = await response.json();
    return new Float32Array(data.embedding || data.vector || []);
  }

  getMetadata() {
    return {
      ...super.getMetadata(),
      type: "api",
      endpoint: this.endpoint,
      description: "Server-side API embedder",
    };
  }
}

/**
 * Embedding service that manages HNSW index with configurable embedders
 */
export class EmbeddingService {
  constructor(embedder = new TestEmbedder(), hnswOptions = {}) {
    this.embedder = embedder;
    this.hnsw = new HNSW({
      M: 16,
      efConstruction: 200,
      efSearch: 50,
      metric: "cosine",
      ...hnswOptions,
    });
    this.metadata = new Map(); // Store original text/metadata for each ID
  }

  /**
   * Add text to the index
   * @param {string} id - Unique identifier
   * @param {string} text - Text to embed and index
   * @param {object} metadata - Additional metadata to store
   */
  async add(id, text, metadata = {}) {
    if (!this.embedder) {
      console.error("EmbeddingService: embedder is null, initializing with TestEmbedder");
      this.embedder = new TestEmbedder();
    }
    const embedding = await this.embedder.embed(text);
    this.hnsw.add(id, embedding);
    this.metadata.set(id, { text, ...metadata });
  }

  /**
   * Search for similar items
   * @param {string} query - Query text
   * @param {number} k - Number of results to return
   * @param {number} ef - Search parameter
   * @returns {Promise<Array>} Search results with metadata
   */
  async search(query, k = 10, ef = null) {
    if (!this.embedder) {
      console.error("EmbeddingService: embedder is null, initializing with TestEmbedder");
      this.embedder = new TestEmbedder();
    }
    const queryEmbedding = await this.embedder.embed(query);
    const results = this.hnsw.search(queryEmbedding, k, ef);

    return results.map((result) => ({
      ...result,
      metadata: this.metadata.get(result.id),
    }));
  }

  /**
   * Get item by ID
   * @param {string} id
   * @returns {object|null}
   */
  get(id) {
    return this.metadata.get(id) || null;
  }

  /**
   * Remove item from index
   * @param {string} id
   */
  remove(id) {
    // Note: HNSW doesn't support removal, would need to rebuild
    this.metadata.delete(id);
  }

  /**
   * Get service metadata including embedder info
   * @returns {object}
   */
  getMetadata() {
    return {
      embedder: this.embedder.getMetadata(),
      hnsw: {
        elementCount: this.hnsw.elementCount,
        M: this.hnsw.M,
        efConstruction: this.hnsw.efConstruction,
        efSearch: this.hnsw.efSearch,
      },
      totalItems: this.metadata.size,
    };
  }

  /**
   * Serialize the service for storage
   * @returns {object}
   */
  toJSON() {
    return {
      embedder: this.embedder.getMetadata(),
      hnsw: this.hnsw.toJSON(),
      metadata: Object.fromEntries(this.metadata),
    };
  }

  /**
   * Restore service from serialized data
   * @param {object} data
   * @param {BaseEmbedder} embedder
   * @returns {EmbeddingService}
   */
  static fromJSON(data, embedder) {
    // Ensure we have a valid embedder - fallback to TestEmbedder if none provided
    const validEmbedder = embedder || new TestEmbedder();
    const service = new EmbeddingService(validEmbedder);
    service.hnsw = HNSW.fromJSON(data.hnsw);
    service.metadata = new Map(Object.entries(data.metadata));
    return service;
  }
}
