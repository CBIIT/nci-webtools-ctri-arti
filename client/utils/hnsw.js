import { openDB, deleteDB } from "idb";

export class HNSW {
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
    this.distFunc = metric === "cosine" 
      ? (a, b) => 1 - this.cosine(a, b) 
      : (a, b) => this.euclidean(a, b);
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
    while (Math.random() < 0.5 && level < 16) {
      level++;
    }
    return level;
  }

  add(id, vector) {
    if (this.nodes.has(id)) {
      throw new Error(`Point ${id} already exists`);
    }

    const node = {
      id,
      vector: Float32Array.from(vector),
      level: this.getRandomLevel(),
      neighbors: [],
    };

    for (let lc = 0; lc <= node.level; lc++) {
      node.neighbors[lc] = [];
    }

    this.nodes.set(id, node);
    this.elementCount++;

    if (this.elementCount === 1) {
      this.entryPoint = id;
      return;
    }

    const entryPointCopy = this.entryPoint;

    for (let lc = node.level; lc >= 0; lc--) {
      const candidates = this.searchLayer(vector, [entryPointCopy], this.efConstruction, lc);

      const m = lc === 0 ? this.maxM0 : this.maxM;
      const neighbors = candidates.slice(0, m);

      for (const neighbor of neighbors) {
        node.neighbors[lc].push(neighbor.id);

        const neighborNode = this.nodes.get(neighbor.id);
        if (neighborNode && neighborNode.neighbors[lc]) {
          neighborNode.neighbors[lc].push(id);

          if (neighborNode.neighbors[lc].length > m) {
            this.pruneConnections(neighborNode, lc, m);
          }
        }
      }
    }

    if (node.level > this.nodes.get(this.entryPoint).level) {
      this.entryPoint = id;
    }
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

      if (current.distance > nearest[0].distance) {
        break;
      }

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

              if (nearest.length > ef) {
                nearest.pop();
              }
            }
          }
        }
      }
    }

    return nearest;
  }

  pruneConnections(node, layer, m) {
    const neighbors = [];
    for (const neighborId of node.neighbors[layer]) {
      if (this.nodes.has(neighborId)) {
        const neighborNode = this.nodes.get(neighborId);
        const dist = this.distFunc(node.vector, neighborNode.vector);
        neighbors.push({ id: neighborId, distance: dist });
      }
    }

    neighbors.sort((a, b) => a.distance - b.distance);
    node.neighbors[layer] = neighbors.slice(0, m).map((n) => n.id);
  }

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
    }

    return hnsw;
  }
}

export class HNSWWithDB extends HNSW {
  db = null;

  constructor({ M = 16, efConstruction = 200, efSearch = 50, metric = "cosine", dbName = "hnsw-db"} = {}) {
    super({ M, efConstruction, efSearch, metric });
    this.dbName = dbName;
  }

  static async create({ M = 16, efConstruction = 200, efSearch = 50, metric = "cosine", dbName = "hnsw-db"} = {}) {
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
