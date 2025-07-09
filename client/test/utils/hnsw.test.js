// Tests for HNSW vector search implementation
import { HNSW, HNSWWithDB } from "../../utils/hnsw.js";

describe('HNSW', () => {
  test('creates index with default parameters', () => {
    const hnsw = new HNSW();
    
    expect(hnsw.M).toBe(16);
    expect(hnsw.maxM).toBe(16);
    expect(hnsw.maxM0).toBe(32);
    expect(hnsw.efConstruction).toBe(200);
    expect(hnsw.efSearch).toBe(50);
    expect(hnsw.elementCount).toBe(0);
    expect(hnsw.nodes).toBeInstanceOf(Map);
    expect(hnsw.nodes.size).toBe(0);
    expect(hnsw.entryPoint).toBe(null);
  });
  
  test('creates index with custom parameters', () => {
    const hnsw = new HNSW({ M: 32, efConstruction: 100, efSearch: 20, metric: 'euclidean' });
    
    expect(hnsw.M).toBe(32);
    expect(hnsw.maxM).toBe(32);
    expect(hnsw.maxM0).toBe(64);
    expect(hnsw.efConstruction).toBe(100);
    expect(hnsw.efSearch).toBe(20);
    expect(hnsw.distFunc).toBeTruthy();
  });
  
  test('adds vectors to index correctly', () => {
    const hnsw = new HNSW();
    const vector1 = new Float32Array([1, 0, 0, 0]);
    const vector2 = new Float32Array([0, 1, 0, 0]);
    
    hnsw.add('id1', vector1);
    hnsw.add('id2', vector2);
    
    expect(hnsw.elementCount).toBe(2);
    expect(hnsw.nodes.size).toBe(2);
    expect(hnsw.nodes.has('id1')).toBe(true);
    expect(hnsw.nodes.has('id2')).toBe(true);
    expect(hnsw.entryPoint).not.toBe(null);
  });
  
  test('rejects duplicate IDs', () => {
    const hnsw = new HNSW();
    const vector = new Float32Array([1, 0, 0, 0]);
    
    hnsw.add('id1', vector);
    
    expect(() => {
      hnsw.add('id1', vector);
    }).toThrow('Point id1 already exists');
  });
  
  test('cosine similarity function works correctly', () => {
    const hnsw = new HNSW({ metric: 'cosine' });
    
    const v1 = new Float32Array([1, 0, 0, 0]);
    const v2 = new Float32Array([1, 0, 0, 0]); // Same vector
    const v3 = new Float32Array([0, 1, 0, 0]); // Orthogonal
    const v4 = new Float32Array([-1, 0, 0, 0]); // Opposite
    
    // Same vector should have similarity 1 (distance 0)
    expect(hnsw.cosine(v1, v2)).toBeCloseTo(1, 5);
    
    // Orthogonal vectors should have similarity 0
    expect(hnsw.cosine(v1, v3)).toBeCloseTo(0, 5);
    
    // Opposite vectors should have similarity -1
    expect(hnsw.cosine(v1, v4)).toBeCloseTo(-1, 5);
  });
  
  test('euclidean distance function works correctly', () => {
    const hnsw = new HNSW({ metric: 'euclidean' });
    
    const v1 = new Float32Array([1, 0, 0, 0]);
    const v2 = new Float32Array([1, 0, 0, 0]); // Same vector
    const v3 = new Float32Array([2, 0, 0, 0]); // Distance 1
    const v4 = new Float32Array([1, 1, 0, 0]); // Distance 1
    
    // Same vector should have distance 0
    expect(hnsw.euclidean(v1, v2)).toBeCloseTo(0, 5);
    
    // Vector with 1 unit difference should have distance 1
    expect(hnsw.euclidean(v1, v3)).toBeCloseTo(1, 5);
    
    // Vector with different component but same magnitude should have distance 1
    expect(hnsw.euclidean(v1, v4)).toBeCloseTo(1, 5);
  });
  
  test('searches for similar vectors', () => {
    const hnsw = new HNSW({ metric: 'cosine' });
    
    // Add some vectors with known similarity relationships
    const v1 = new Float32Array([1, 0, 0, 0]);
    const v2 = new Float32Array([0.9, 0.1, 0, 0]); // Similar to v1
    const v3 = new Float32Array([0, 1, 0, 0]); // Different from v1
    const v4 = new Float32Array([0, 0.9, 0.1, 0]); // Similar to v3
    
    hnsw.add('id1', v1);
    hnsw.add('id2', v2);
    hnsw.add('id3', v3);
    hnsw.add('id4', v4);
    
    // Search with v1 as query
    const resultsV1 = hnsw.search(v1, 2);
    
    // Should return id1 and id2 (most similar to v1)
    expect(resultsV1).toHaveLength(2);
    expect(resultsV1[0].id).toBe('id1'); // Most similar is itself
    expect(resultsV1[1].id).toBe('id2'); // Second most similar
    
    // Search with v3 as query
    const resultsV3 = hnsw.search(v3, 2);
    
    // Should return id3 and id4 (most similar to v3)
    expect(resultsV3).toHaveLength(2);
    expect(resultsV3[0].id).toBe('id3'); // Most similar is itself
    expect(resultsV3[1].id).toBe('id4'); // Second most similar
  });
  
  test('serializes and deserializes correctly', () => {
    const hnsw = new HNSW({ M: 24, efConstruction: 100, efSearch: 30 });
    
    // Add some vectors
    hnsw.add('id1', new Float32Array([1, 0, 0, 0]));
    hnsw.add('id2', new Float32Array([0, 1, 0, 0]));
    
    // Serialize
    const serialized = hnsw.toJSON();
    
    // Check serialized structure
    expect(serialized).toHaveProperty('M', 24);
    expect(serialized).toHaveProperty('efConstruction', 100);
    expect(serialized).toHaveProperty('efSearch', 30);
    expect(serialized).toHaveProperty('elementCount', 2);
    expect(serialized).toHaveProperty('nodes');
    expect(serialized.nodes).toHaveLength(2);
    
    // Deserialize
    const restored = HNSW.fromJSON(serialized);
    
    // Check restored instance
    expect(restored.M).toBe(24);
    expect(restored.efConstruction).toBe(100);
    expect(restored.efSearch).toBe(30);
    expect(restored.elementCount).toBe(2);
    expect(restored.nodes.size).toBe(2);
    expect(restored.nodes.has('id1')).toBe(true);
    expect(restored.nodes.has('id2')).toBe(true);
    
    // Check search functionality still works
    const results = restored.search(new Float32Array([1, 0, 0, 0]), 1);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('id1');
  });
});

// Note: HNSWWithDB tests are skipped as they require IndexedDB which isn't available in the test environment
describe('HNSWWithDB', () => {
  test('creates instance with default parameters', () => {
    const hnswDB = new HNSWWithDB();
    
    expect(hnswDB.M).toBe(16);
    expect(hnswDB.efConstruction).toBe(200);
    expect(hnswDB.efSearch).toBe(50);
    expect(hnswDB.dbName).toBe('hnsw-db');
    expect(hnswDB.db).toBe(null);
  });
  
  test('creates instance with custom parameters', () => {
    const hnswDB = new HNSWWithDB({ 
      M: 32, 
      efConstruction: 100, 
      efSearch: 20,
      metric: 'euclidean',
      dbName: 'custom-db'
    });
    
    expect(hnswDB.M).toBe(32);
    expect(hnswDB.efConstruction).toBe(100);
    expect(hnswDB.efSearch).toBe(20);
    expect(hnswDB.dbName).toBe('custom-db');
  });
});