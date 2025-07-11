import { openDB, deleteDB } from "idb";

/**
 * Hierarchical Navigable Small World (HNSW) index for approximate nearest neighbor search.
 *
 * HNSW is a graph-based algorithm that builds a multi-layer structure where each layer contains
 * a subset of points with connections to nearby neighbors. This enables logarithmic search complexity
 * while maintaining high recall rates.
 *
 * @class HNSW
 *
 * @example
 * // Basic usage
 * const index = new HNSW({
 *   M: 16,              // Number of connections per node
 *   efConstruction: 200, // Size of dynamic candidate list
 *   efSearch: 50,       // Size of search candidate list
 *   metric: 'cosine'    // Distance metric ('cosine' or 'euclidean')
 * });
 *
 * // Add vectors
 * index.add('item1', [0.1, 0.2, 0.3, 0.4]);
 * index.add('item2', [0.5, 0.6, 0.7, 0.8]);
 *
 * // Search for nearest neighbors
 * const results = index.search([0.15, 0.25, 0.35, 0.45], 5);
 * console.log(results);
 * // [{ id: 'item1', distance: 0.02 }, { id: 'item2', distance: 0.52 }]
 *
 * @example
 * // Efficient updates
 * // Minor update (in-place, O(1))
 * index.update('item1', [0.11, 0.21, 0.31, 0.41], 0.1);
 *
 * // Major update (reconnects node)
 * index.update('item1', [0.9, 0.8, 0.7, 0.6], 0.1);
 *
 * @example
 * // Batch operations for better performance
 * const items = [
 *   ['vec1', [0.1, 0.2, 0.3]],
 *   ['vec2', [0.4, 0.5, 0.6]],
 *   ['vec3', [0.7, 0.8, 0.9]]
 * ];
 *
 * const results = index.addBatch(items);
 * // [{ id: 'vec1', success: true }, ...]
 *
 * @example
 * // Serialization
 * const serialized = JSON.stringify(index.toJSON());
 * const restored = HNSW.fromJSON(JSON.parse(serialized));
 *
 * @param {Object} options - Configuration options
 * @param {number} [options.M=16] - Number of bi-directional connections per node (higher = better quality, slower)
 * @param {number} [options.efConstruction=200] - Size of dynamic candidate list (higher = better quality, slower construction)
 * @param {number} [options.efSearch=50] - Size of search candidate list (higher = better quality, slower search)
 * @param {string} [options.metric='cosine'] - Distance metric: 'cosine' or 'euclidean'
 */
export class HNSW {
  /**
   * Creates a new HNSW index
   * @param {Object} options - Configuration options
   * @param {number} [options.M=16] - Number of connections per node
   * @param {number} [options.efConstruction=200] - Construction time accuracy/speed tradeoff
   * @param {number} [options.efSearch=50] - Search time accuracy/speed tradeoff
   * @param {string} [options.metric='cosine'] - Distance metric
   */
  constructor({ M = 16, efConstruction = 200, efSearch = 50, metric = "cosine" } = {}) {
    this.M = M;
    this.maxM = M;
    this.maxM0 = M * 2;
    this.efConstruction = Math.max(efConstruction, M);
    this.efSearch = efSearch;
    this.ml = 1.0 / Math.log(2.0);
    this.elementCount = 0;
    this.nodes = new Map();
    this.entryPoint = null;

    // Optimization: Track nodes by level for faster entry point selection
    this.nodesByLevel = new Map();

    this.distFunc = metric === "cosine" ? (a, b) => 1 - this.cosine(a, b) : (a, b) => this.euclidean(a, b);
  }

  cosine(a, b) {
    let dot = 0,
      normA = 0,
      normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  euclidean(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  getRandomLevel() {
    let level = 0;
    while (Math.random() < 0.5 && level < 16) level++;
    return level;
  }

  // Helper to maintain level index
  _addToLevelIndex(id, level) {
    if (!this.nodesByLevel.has(level)) {
      this.nodesByLevel.set(level, new Set());
    }
    this.nodesByLevel.get(level).add(id);
  }

  _removeFromLevelIndex(id, level) {
    if (this.nodesByLevel.has(level)) {
      this.nodesByLevel.get(level).delete(id);
      if (this.nodesByLevel.get(level).size === 0) {
        this.nodesByLevel.delete(level);
      }
    }
  }

  /**
   * Adds a vector to the index
   * @param {string|number} id - Unique identifier for the vector
   * @param {number[]} vector - Vector values
   * @throws {Error} If id already exists
   * @returns {void}
   * @complexity O(M × efConstruction × log(N))
   *
   * @example
   * index.add('doc1', [0.1, 0.2, 0.3]);
   */
  add(id, vector) {
    if (this.nodes.has(id)) {
      throw new Error(`Point ${id} already exists`);
    }

    const level = this.getRandomLevel();
    const node = {
      id,
      vector: Float32Array.from(vector),
      level,
      neighbors: Array(level + 1)
        .fill(null)
        .map(() => []),
    };

    this.nodes.set(id, node);
    this._addToLevelIndex(id, level);
    this.elementCount++;

    if (this.elementCount === 1) {
      this.entryPoint = id;
      return;
    }

    this._insertNode(node);
  }

  _insertNode(node) {
    const entryPointCopy = this.entryPoint;

    for (let lc = node.level; lc >= 0; lc--) {
      const candidates = this.searchLayer(node.vector, [entryPointCopy], this.efConstruction, lc);
      const m = lc === 0 ? this.maxM0 : this.maxM;

      // Select m neighbors using heuristic
      const neighbors = this._selectNeighborsHeuristic(candidates, m);

      for (const neighbor of neighbors) {
        node.neighbors[lc].push(neighbor.id);
        const neighborNode = this.nodes.get(neighbor.id);

        if (neighborNode && neighborNode.neighbors[lc]) {
          neighborNode.neighbors[lc].push(node.id);

          // Prune neighbor's connections if needed
          if (neighborNode.neighbors[lc].length > m) {
            this._pruneConnections(neighborNode, lc, m);
          }
        }
      }
    }

    // Update entry point if necessary
    if (node.level > this.nodes.get(this.entryPoint).level) {
      this.entryPoint = node.id;
    }
  }

  // Optimized neighbor selection using heuristic
  _selectNeighborsHeuristic(candidates, m) {
    if (candidates.length <= m) return candidates;

    // Simple heuristic: prefer diverse neighbors
    const selected = [];
    const remaining = [...candidates];

    // First, add the closest neighbor
    selected.push(remaining.shift());

    while (selected.length < m && remaining.length > 0) {
      let bestIdx = 0;
      let bestScore = -Infinity;

      // Find candidate that maximizes minimum distance to selected neighbors
      for (let i = 0; i < remaining.length; i++) {
        let minDist = Infinity;
        for (const sel of selected) {
          const dist = this.distFunc(this.nodes.get(remaining[i].id).vector, this.nodes.get(sel.id).vector);
          minDist = Math.min(minDist, dist);
        }

        if (minDist > bestScore) {
          bestScore = minDist;
          bestIdx = i;
        }
      }

      selected.push(remaining.splice(bestIdx, 1)[0]);
    }

    return selected;
  }

  /**
   * Removes a vector from the index
   * @param {string|number} id - Identifier of vector to remove
   * @throws {Error} If id does not exist
   * @returns {boolean} True if successfully removed
   * @complexity O(M × log(N))
   *
   * @example
   * index.remove('doc1');
   */
  remove(id) {
    if (!this.nodes.has(id)) {
      throw new Error(`Point ${id} does not exist`);
    }

    const nodeToRemove = this.nodes.get(id);

    // Remove from level index
    this._removeFromLevelIndex(id, nodeToRemove.level);

    // Remove bidirectional connections
    for (let lc = 0; lc <= nodeToRemove.level; lc++) {
      for (const neighborId of nodeToRemove.neighbors[lc]) {
        const neighborNode = this.nodes.get(neighborId);
        if (neighborNode && neighborNode.neighbors[lc]) {
          const idx = neighborNode.neighbors[lc].indexOf(id);
          if (idx !== -1) {
            neighborNode.neighbors[lc].splice(idx, 1);
          }
        }
      }
    }

    this.nodes.delete(id);
    this.elementCount--;

    // Optimized entry point selection - O(1) instead of O(N)
    if (this.entryPoint === id) {
      this._selectNewEntryPoint();
    }

    return true;
  }

  _selectNewEntryPoint() {
    if (this.elementCount === 0) {
      this.entryPoint = null;
      return;
    }

    // Find highest level with nodes - O(L) where L is max level (typically ~log N)
    const levels = Array.from(this.nodesByLevel.keys()).sort((a, b) => b - a);
    if (levels.length > 0) {
      const highestLevel = levels[0];
      const nodesAtLevel = this.nodesByLevel.get(highestLevel);
      this.entryPoint = nodesAtLevel.values().next().value;
    }
  }

  /**
   * Updates a vector's values, optionally reconnecting it in the graph
   * @param {string|number} id - Identifier of vector to update
   * @param {number[]} newVector - New vector values
   * @param {number} [threshold=0.1] - Distance threshold for reconnection (0-1 for cosine)
   * @throws {Error} If id does not exist
   * @returns {boolean} True if successfully updated
   * @complexity O(1) for minor updates, O(M × log(N)) for major updates
   *
   * @example
   * // Minor update (vector change < threshold) - O(1)
   * index.update('doc1', [0.11, 0.21, 0.31], 0.1);
   *
   * // Major update (vector change >= threshold) - requires reconnection
   * index.update('doc1', [0.9, 0.8, 0.7], 0.1);
   */
  update(id, newVector, threshold = 0.1) {
    if (!this.nodes.has(id)) {
      throw new Error(`Point ${id} does not exist`);
    }

    const node = this.nodes.get(id);
    const oldVector = Array.from(node.vector);

    // Calculate distance between old and new vectors
    const vectorDistance = this.distFunc(oldVector, newVector);

    // Update vector in place
    node.vector = Float32Array.from(newVector);

    // If change is small, just update vector without reconnecting
    if (vectorDistance < threshold) {
      return true;
    }

    // For significant changes, reconnect the node
    this._reconnectNode(node);
    return true;
  }

  // Reconnect node after vector update
  _reconnectNode(node) {
    // Remove old connections
    for (let lc = 0; lc <= node.level; lc++) {
      for (const neighborId of node.neighbors[lc]) {
        const neighborNode = this.nodes.get(neighborId);
        if (neighborNode && neighborNode.neighbors[lc]) {
          const idx = neighborNode.neighbors[lc].indexOf(node.id);
          if (idx !== -1) {
            neighborNode.neighbors[lc].splice(idx, 1);
          }
        }
      }
      node.neighbors[lc] = [];
    }

    // Reinsert with new connections
    this._insertNode(node);
  }

  /**
   * Adds multiple vectors in a single operation
   * @param {Array<[string|number, number[]]>} items - Array of [id, vector] pairs
   * @returns {Array<{id: string|number, success: boolean, error?: string}>} Results for each item
   *
   * @example
   * const results = index.addBatch([
   *   ['doc1', [0.1, 0.2, 0.3]],
   *   ['doc2', [0.4, 0.5, 0.6]]
   * ]);
   */
  addBatch(items) {
    const results = [];
    for (const [id, vector] of items) {
      try {
        this.add(id, vector);
        results.push({ id, success: true });
      } catch (error) {
        results.push({ id, success: false, error: error.message });
      }
    }
    return results;
  }

  /**
   * Removes multiple vectors in a single operation
   * @param {Array<string|number>} ids - Array of identifiers to remove
   * @returns {Array<{id: string|number, success: boolean, error?: string}>} Results for each id
   *
   * @example
   * const results = index.removeBatch(['doc1', 'doc2', 'doc3']);
   */
  removeBatch(ids) {
    const results = [];
    for (const id of ids) {
      try {
        this.remove(id);
        results.push({ id, success: true });
      } catch (error) {
        results.push({ id, success: false, error: error.message });
      }
    }
    return results;
  }

  /**
   * Updates multiple vectors in a single operation
   * @param {Array<[string|number, number[]]>} items - Array of [id, vector] pairs
   * @param {number} [threshold=0.1] - Distance threshold for reconnection
   * @returns {Array<{id: string|number, success: boolean, error?: string}>} Results for each item
   *
   * @example
   * const results = index.updateBatch([
   *   ['doc1', [0.1, 0.2, 0.3]],
   *   ['doc2', [0.4, 0.5, 0.6]]
   * ], 0.1);
   */
  updateBatch(items, threshold = 0.1) {
    const results = [];
    for (const [id, vector] of items) {
      try {
        this.update(id, vector, threshold);
        results.push({ id, success: true });
      } catch (error) {
        results.push({ id, success: false, error: error.message });
      }
    }
    return results;
  }

  _pruneConnections(node, layer, m) {
    const neighbors = node.neighbors[layer].map((neighborId) => ({
      id: neighborId,
      distance: this.distFunc(node.vector, this.nodes.get(neighborId).vector),
    }));

    neighbors.sort((a, b) => a.distance - b.distance);
    node.neighbors[layer] = neighbors.slice(0, m).map((n) => n.id);
  }

  searchLayer(query, entryPoints, ef, layer) {
    const visited = new Set();
    const candidates = [];
    const nearest = [];

    for (const pointId of entryPoints) {
      if (this.nodes.has(pointId)) {
        const node = this.nodes.get(pointId);
        const dist = this.distFunc(query, node.vector);
        const point = { id: pointId, distance: dist };
        candidates.push(point);
        nearest.push(point);
        visited.add(pointId);
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    nearest.sort((a, b) => a.distance - b.distance);

    while (candidates.length > 0) {
      const current = candidates.shift();
      if (current.distance > nearest[0].distance) break;

      const currentNode = this.nodes.get(current.id);
      if (currentNode && currentNode.neighbors[layer]) {
        for (const neighborId of currentNode.neighbors[layer]) {
          if (!visited.has(neighborId) && this.nodes.has(neighborId)) {
            visited.add(neighborId);
            const neighborNode = this.nodes.get(neighborId);
            const dist = this.distFunc(query, neighborNode.vector);

            if (dist < nearest[nearest.length - 1].distance || nearest.length < ef) {
              const point = { id: neighborId, distance: dist };
              candidates.push(point);
              nearest.push(point);
              candidates.sort((a, b) => a.distance - b.distance);
              nearest.sort((a, b) => a.distance - b.distance);
              if (nearest.length > ef) nearest.pop();
            }
          }
        }
      }
    }

    return nearest;
  }

  /**
   * Searches for k nearest neighbors
   * @param {number[]} queryVector - Query vector
   * @param {number} [k=10] - Number of neighbors to return
   * @param {number} [ef=null] - Search candidate list size (defaults to max(efSearch, k))
   * @returns {Array<{id: string|number, distance: number}>} Nearest neighbors sorted by distance
   * @complexity O(efSearch × log(N))
   *
   * @example
   * const neighbors = index.search([0.1, 0.2, 0.3], 5);
   * // Returns: [{ id: 'doc1', distance: 0.02 }, ...]
   */
  search(queryVector, k = 10, ef = null) {
    if (this.elementCount === 0) return [];

    ef = ef || Math.max(this.efSearch, k);
    const entryNode = this.nodes.get(this.entryPoint);
    if (!entryNode) return [];

    let candidates = [this.entryPoint];

    for (let lc = entryNode.level; lc > 0; lc--) {
      const nearest = this.searchLayer(queryVector, candidates, 1, lc);
      candidates = nearest.map((n) => n.id);
    }

    const nearest = this.searchLayer(queryVector, candidates, ef, 0);
    return nearest.slice(0, k).map((item) => ({
      id: item.id,
      distance: item.distance,
    }));
  }

  /**
   * Serializes the index to JSON
   * @returns {Object} JSON representation of the index
   * 
   * @example
   * const data = index.toJSON();
   */
  toJSON() {
    const nodesArray = [];
    for (const [id, node] of this.nodes) {
      nodesArray.push({
        id,
        vector: Array.from(node.vector),
        level: node.level,
        neighbors: node.neighbors,
      });
    }

    return {
      M: this.M,
      efConstruction: this.efConstruction,
      efSearch: this.efSearch,
      elementCount: this.elementCount,
      entryPoint: this.entryPoint,
      nodes: nodesArray,
    };
  }

  /**
   * Deserializes an index from JSON
   * @param {Object} data - JSON representation of the index
   * @returns {HNSW} Restored index instance
   * @static
   * 
   * @example
   * const data = JSON.parse(fs.readFileSync('index.json'));
   * const index = HNSW.fromJSON(data);
   */
  static fromJSON(data) {
    const hnsw = new HNSW({
      M: data.M,
      efConstruction: data.efConstruction,
      efSearch: data.efSearch,
    });

    hnsw.elementCount = data.elementCount;
    hnsw.entryPoint = data.entryPoint;

    for (const nodeData of data.nodes) {
      const node = {
        id: nodeData.id,
        vector: Float32Array.from(nodeData.vector),
        level: nodeData.level,
        neighbors: nodeData.neighbors,
      };
      hnsw.nodes.set(nodeData.id, node);
      hnsw._addToLevelIndex(nodeData.id, nodeData.level);
    }

    return hnsw;
  }
}

export class HNSWWithDB extends HNSW {
  db = null;

  constructor({ M = 16, efConstruction = 200, efSearch = 50, metric = "cosine", dbName = "hnsw-db" } = {}) {
    super({ M, efConstruction, efSearch, metric });
    this.dbName = dbName;
  }

  static async create({ M = 16, efConstruction = 200, efSearch = 50, metric = "cosine", dbName = "hnsw-db" } = {}) {
    const instance = new HNSWWithDB({ M, efConstruction, efSearch, metric, dbName });
    await instance.initDB();
    return instance;
  }

  async initDB() {
    this.db = await openDB(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore("hnsw-index");
      },
    });
  }

  async saveIndex() {
    if (!this.db) {
      // console.error('Database is not initialized');
      return;
    }

    await this.db.put("hnsw-index", this.toJSON(), "hnsw");
  }

  async loadIndex() {
    if (!this.db) {
      // console.error('Database is not initialized');
      return;
    }

    const loadedHNSW = await this.db.get("hnsw-index", "hnsw");

    if (!loadedHNSW) {
      // console.error('No saved HNSW index found');
      return;
    }

    const hnsw = HNSW.fromJSON(loadedHNSW);
    this.M = hnsw.M;
    this.efConstruction = hnsw.efConstruction;
    this.efSearch = hnsw.efSearch;
    this.elementCount = hnsw.elementCount;
    this.entryPoint = hnsw.entryPoint;
    this.nodes = hnsw.nodes;
  }

  async deleteIndex() {
    if (!this.db) {
      // console.error('Database is not initialized');
      return;
    }

    try {
      await deleteDB(this.dbName);
      this.initDB();
    } catch (error) {
      // console.error('Failed to delete index:', error);
    }
  }
}