import { openDB, deleteDB } from "idb"

export class PriorityQueue {
  items = []

  constructor(compare) {
    this.compare = compare
  }

  push(item) {
    let i = 0
    while (i < this.items.length && this.compare(item, this.items[i]) > 0) {
      i++
    }
    this.items.splice(i, 0, item)
  }

  pop() {
    return this.items.shift()
  }

  isEmpty() {
    return this.items.length === 0
  }
}

export class Node {
  constructor(id, vector, level, M) {
    this.id = id
    this.vector = vector
    this.level = level
    this.neighbors = Array.from({ length: level + 1 }, () =>
      new Array(M).fill(-1)
    )
  }
}

function dotProduct(a, b) {
  let dP = 0.0
  for (let i = 0; i < a.length; i++) {
    dP += a[i] * b[i]
  }
  return dP
}

export function cosineSimilarity(a, b) {
  return (
    dotProduct(a, b) /
    (Math.sqrt(dotProduct(a, a)) * Math.sqrt(dotProduct(b, b)))
  )
}

function euclideanDistance(a, b) {
  let sum = 0.0
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2
  }
  return Math.sqrt(sum)
}

export function euclideanSimilarity(a, b) {
  return 1 / (1 + euclideanDistance(a, b))
}

export class HNSW {
  d = null // Dimension of the vectors

  constructor(M = 16, efConstruction = 200, d = null, metric = "cosine") {
    this.metric = metric
    this.d = d
    this.M = M
    this.efConstruction = efConstruction
    this.entryPointId = -1
    this.nodes = new Map()
    this.probs = this.set_probs(M, 1 / Math.log(M))
    this.levelMax = this.probs.length - 1
    this.similarityFunction = this.getMetric(metric)
  }

  getMetric(metric) {
    if (metric === "cosine") {
      return cosineSimilarity
    } else if (metric === "euclidean") {
      return euclideanSimilarity
    } else {
      throw new Error("Invalid metric")
    }
  }

  set_probs(M, levelMult) {
    let level = 0
    const probs = []
    while (true) {
      const prob = Math.exp(-level / levelMult) * (1 - Math.exp(-1 / levelMult))
      if (prob < 1e-9) break
      probs.push(prob)
      level++
    }
    return probs
  }

  selectLevel() {
    let r = Math.random()
    for (let i = 0; i < this.probs.length; i++) {
      if (r < this.probs[i]) {
        return i
      }
      r -= this.probs[i]
    }
    return this.probs.length - 1
  }

  async addNodeToGraph(node) {
    if (this.entryPointId === -1) {
      this.entryPointId = node.id
      return
    }

    let currentNode = this.nodes.get(this.entryPointId)
    let closestNode = currentNode

    for (let level = this.levelMax; level >= 0; level--) {
      while (true) {
        let nextNode = null
        let maxSimilarity = -Infinity

        // Make sure neighbors array exists and is iterable
        if (currentNode.neighbors && Array.isArray(currentNode.neighbors[level])) {
          for (let i = 0; i < currentNode.neighbors[level].length; i++) {
            const neighborId = currentNode.neighbors[level][i];
            if (neighborId === -1) continue;

            const neighborNode = this.nodes.get(neighborId);
            if (!neighborNode) continue;
            
            const similarity = this.similarityFunction(
              node.vector,
              neighborNode.vector
            );
            if (similarity > maxSimilarity) {
              maxSimilarity = similarity;
              nextNode = neighborNode;
            }
          }
        }

        const currentSimilarity = this.similarityFunction(node.vector, closestNode.vector);
        if (nextNode && maxSimilarity > currentSimilarity) {
          currentNode = nextNode;
          closestNode = currentNode;
        } else {
          break;
        }
      }
    }

    const closestLevel = Math.min(node.level, closestNode.level);
    for (let level = 0; level <= closestLevel; level++) {
      // Ensure the neighbors arrays are properly initialized
      if (!Array.isArray(closestNode.neighbors[level])) {
        closestNode.neighbors[level] = new Array(this.M).fill(-1);
      }
      
      if (!Array.isArray(node.neighbors[level])) {
        node.neighbors[level] = new Array(this.M).fill(-1);
      }
      
      // Add bidirectional connections
      this.addNeighbor(closestNode, node.id, level);
      this.addNeighbor(node, closestNode.id, level);
    }
  }
  
  // Helper method to safely add a neighbor
  addNeighbor(node, neighborId, level) {
    // Find the first available slot or replace the least similar neighbor
    let emptyIndex = -1;
    for (let i = 0; i < node.neighbors[level].length; i++) {
      if (node.neighbors[level][i] === -1) {
        emptyIndex = i;
        break;
      }
    }
    
    if (emptyIndex >= 0) {
      // Found an empty slot
      node.neighbors[level][emptyIndex] = neighborId;
    } else if (node.neighbors[level].length < this.M) {
      // Array is not at max capacity
      node.neighbors[level].push(neighborId);
    }
    // If array is full, we would need similarity comparison to replace the least similar
    // but for now we'll just keep the existing neighbors
  }

  async addPoint(id, vector) {
    if (this.d !== null && vector.length !== this.d) {
      throw new Error("All vectors must be of the same dimension")
    }
    this.d = vector.length

    this.nodes.set(id, new Node(id, vector, this.selectLevel(), this.M))
    const node = this.nodes.get(id)
    this.levelMax = Math.max(this.levelMax, node.level)

    await this.addNodeToGraph(node)
  }

  searchKNN(query, k) {
    // Return empty array if graph is empty
    if (this.nodes.size === 0) {
      return [];
    }

    // Check if there's only one node in the graph
    if (this.nodes.size === 1) {
      const onlyNode = this.nodes.get(this.entryPointId);
      const similarity = this.similarityFunction(onlyNode.vector, query);
      return [{ id: this.entryPointId, score: similarity }];
    }

    // Store all similarities to avoid recalculating
    const similarities = new Map();
    const getSimilarity = (nodeId) => {
      if (!similarities.has(nodeId)) {
        const node = this.nodes.get(nodeId);
        similarities.set(nodeId, this.similarityFunction(node.vector, query));
      }
      return similarities.get(nodeId);
    };

    // Use a priority queue to collect results sorted by similarity
    const results = [];
    const visited = new Set();

    // Start from entry point and visit all nodes
    const toVisit = [this.entryPointId];
    
    while (toVisit.length > 0 && results.length < this.nodes.size) {
      const currentId = toVisit.shift();
      
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      
      const currentNode = this.nodes.get(currentId);
      const similarity = getSimilarity(currentId);
      
      // Add this node to results
      results.push({ id: currentId, score: similarity });
      
      // Enqueue all unvisited neighbors
      for (let level = 0; level <= currentNode.level; level++) {
        for (const neighborId of currentNode.neighbors[level]) {
          if (neighborId !== -1 && !visited.has(neighborId) && !toVisit.includes(neighborId)) {
            toVisit.push(neighborId);
          }
        }
      }
    }

    // Sort by similarity score in descending order
    results.sort((a, b) => b.score - a.score);
    
    // Return top k results
    return results.slice(0, k);
  }

  async buildIndex(data) {
    // Clear existing index
    this.nodes.clear()
    this.levelMax = 0
    this.entryPointId = -1

    // Add points to the index
    for (const item of data) {
      await this.addPoint(item.id, item.vector)
    }
  }

  toJSON() {
    const entries = Array.from(this.nodes.entries())
    return {
      M: this.M,
      efConstruction: this.efConstruction,
      levelMax: this.levelMax,
      entryPointId: this.entryPointId,
      nodes: entries.map(([id, node]) => {
        return [
          id,
          {
            id: node.id,
            level: node.level,
            vector: Array.from(node.vector),
            neighbors: node.neighbors.map(level => Array.from(level))
          }
        ]
      })
    }
  }

  static fromJSON(json) {
    const hnsw = new HNSW(json.M, json.efConstruction)
    hnsw.levelMax = json.levelMax
    hnsw.entryPointId = json.entryPointId
    hnsw.nodes = new Map(
      json.nodes.map(([id, nodeData]) => {
        // Create a proper Node instance
        const node = new Node(
          nodeData.id, 
          new Float32Array(nodeData.vector),
          nodeData.level,
          json.M
        )
        // Copy the neighbors data
        for (let i = 0; i <= nodeData.level; i++) {
          if (nodeData.neighbors[i]) {
            for (let j = 0; j < Math.min(nodeData.neighbors[i].length, json.M); j++) {
              node.neighbors[i][j] = nodeData.neighbors[i][j]
            }
          }
        }
        return [id, node]
      })
    )
    return hnsw
  }
}

export class HNSWWithDB extends HNSW {
  db = null

  constructor(M, efConstruction, dbName) {
    super(M, efConstruction)
    this.dbName = dbName
  }

  static async create(M, efConstruction, dbName) {
    const instance = new HNSWWithDB(M, efConstruction, dbName)
    await instance.initDB()
    return instance
  }

  async initDB() {
    this.db = await openDB(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore("hnsw-index")
      }
    })
  }

  async saveIndex() {
    if (!this.db) {
      // console.error('Database is not initialized');
      return
    }

    await this.db.put("hnsw-index", this.toJSON(), "hnsw")
  }

  async loadIndex() {
    if (!this.db) {
      // console.error('Database is not initialized');
      return
    }

    const loadedHNSW = await this.db.get("hnsw-index", "hnsw")

    if (!loadedHNSW) {
      // console.error('No saved HNSW index found');
      return
    }

    // Update this HNSW instance with loaded data
    const hnsw = HNSW.fromJSON(loadedHNSW)
    this.M = hnsw.M
    this.efConstruction = hnsw.efConstruction
    this.levelMax = hnsw.levelMax
    this.entryPointId = hnsw.entryPointId
    this.nodes = hnsw.nodes
  }

  async deleteIndex() {
    if (!this.db) {
      // console.error('Database is not initialized');
      return
    }

    try {
      await deleteDB(this.dbName)
      this.initDB()
    } catch (error) {
      // console.error('Failed to delete index:', error);
    }
  }
}
