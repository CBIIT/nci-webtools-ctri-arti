// Tests for embedding system
import { BaseEmbedder, TestEmbedder, EmbeddingService } from "../../models/embedders.js";

describe('BaseEmbedder', () => {
  test('creates embedder with default dimensions', () => {
    const embedder = new BaseEmbedder();
    
    expect(embedder.dimensions).toBe(512);
    expect(embedder.getMetadata()).toHaveProperty('name', 'BaseEmbedder');
    expect(embedder.getMetadata()).toHaveProperty('dimensions', 512);
    expect(embedder.getMetadata()).toHaveProperty('version', '1.0.0');
  });

  test('accepts custom dimensions', () => {
    const embedder = new BaseEmbedder(256);
    
    expect(embedder.dimensions).toBe(256);
    expect(embedder.getMetadata().dimensions).toBe(256);
  });

  test('embed method throws error (must be implemented)', async () => {
    const embedder = new BaseEmbedder();
    
    await expect(embedder.embed('test')).rejects.toThrow('embed method must be implemented');
  });
});

describe('TestEmbedder', () => {
  test('creates test embedder with default dimensions', () => {
    const embedder = new TestEmbedder();
    
    expect(embedder.dimensions).toBe(128);
    expect(embedder.getMetadata().type).toBe('test');
    expect(embedder.getMetadata().description).toContain('Simple byte-based');
  });

  test('embeds text to Float32Array of correct size', async () => {
    const embedder = new TestEmbedder(64);
    const embedding = await embedder.embed('hello world');
    
    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(64);
  });

  test('produces consistent embeddings for same text', async () => {
    const embedder = new TestEmbedder();
    const embedding1 = await embedder.embed('test text');
    const embedding2 = await embedder.embed('test text');
    
    expect(embedding1).toEqual(embedding2);
  });

  test('produces different embeddings for different text', async () => {
    const embedder = new TestEmbedder();
    const embedding1 = await embedder.embed('hello');
    const embedding2 = await embedder.embed('world');
    
    expect(embedding1).not.toEqual(embedding2);
  });

  test('handles empty/null text gracefully', async () => {
    const embedder = new TestEmbedder(32);
    
    const emptyEmbedding = await embedder.embed('');
    const nullEmbedding = await embedder.embed(null);
    const undefinedEmbedding = await embedder.embed(undefined);
    
    expect(emptyEmbedding).toBeInstanceOf(Float32Array);
    expect(emptyEmbedding.length).toBe(32);
    expect(nullEmbedding.length).toBe(32);
    expect(undefinedEmbedding.length).toBe(32);
    
    // All should be zero vectors
    expect(Array.from(emptyEmbedding).every(x => x === 0)).toBe(true);
  });

  test('normalizes byte values to [-1, 1] range', async () => {
    const embedder = new TestEmbedder();
    const embedding = await embedder.embed('test');
    
    // All values should be in [-1, 1] range
    for (let i = 0; i < embedding.length; i++) {
      expect(embedding[i]).toBeGreaterThanOrEqual(-1);
      expect(embedding[i]).toBeLessThanOrEqual(1);
    }
  });

  test('cycles through bytes for longer dimensions', async () => {
    const embedder = new TestEmbedder(10);
    const embedding = await embedder.embed('hi'); // 2 bytes
    
    // Should cycle: positions 0,2,4,6,8 should equal positions 1,3,5,7,9
    expect(embedding[0]).toBe(embedding[2]);
    expect(embedding[1]).toBe(embedding[3]);
    expect(embedding[0]).toBe(embedding[4]);
  });
});

describe('EmbeddingService', () => {
  let service;
  let embedder;

  beforeEach(() => {
    embedder = new TestEmbedder(32);
    service = new EmbeddingService(embedder);
  });

  test('creates service with embedder and HNSW index', () => {
    expect(service.embedder).toBe(embedder);
    expect(service.hnsw).toBeTruthy();
    expect(service.metadata).toBeInstanceOf(Map);
    expect(service.metadata.size).toBe(0);
  });

  test('accepts custom HNSW options', () => {
    const customService = new EmbeddingService(embedder, { M: 32, metric: 'euclidean' });
    
    expect(customService.hnsw.M).toBe(32);
    expect(customService.hnsw.distFunc).toBeTruthy();
  });

  test('adds items to index with metadata', async () => {
    await service.add('item1', 'hello world', { type: 'test' });
    
    expect(service.hnsw.elementCount).toBe(1);
    expect(service.metadata.has('item1')).toBe(true);
    expect(service.metadata.get('item1')).toEqual({
      text: 'hello world',
      type: 'test'
    });
  });

  test('searches for similar items', async () => {
    await service.add('item1', 'hello world', { type: 'greeting' });
    await service.add('item2', 'goodbye world', { type: 'farewell' });
    await service.add('item3', 'hello universe', { type: 'greeting' });
    
    const results = await service.search('hello world', 2);
    
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('item1'); // Exact match should be first
    expect(results[0].metadata.text).toBe('hello world');
    expect(results[0]).toHaveProperty('distance');
    expect(results[1].metadata).toBeTruthy();
  });

  test('returns results with metadata', async () => {
    await service.add('test1', 'test content', { 
      type: 'message', 
      userId: 'user1',
      timestamp: '2023-01-01'
    });
    
    const results = await service.search('test', 1);
    
    expect(results[0].metadata).toEqual({
      text: 'test content',
      type: 'message',
      userId: 'user1',
      timestamp: '2023-01-01'
    });
  });

  test('get method retrieves item by ID', async () => {
    await service.add('item1', 'hello', { type: 'test' });
    
    const item = service.get('item1');
    
    expect(item).toEqual({
      text: 'hello',
      type: 'test'
    });
    
    expect(service.get('nonexistent')).toBe(null);
  });

  test('remove method deletes metadata', async () => {
    await service.add('item1', 'hello', { type: 'test' });
    
    expect(service.get('item1')).toBeTruthy();
    
    service.remove('item1');
    
    expect(service.get('item1')).toBe(null);
  });

  test('getMetadata returns service info', async () => {
    await service.add('item1', 'test', {});
    
    const metadata = service.getMetadata();
    
    expect(metadata).toHaveProperty('embedder');
    expect(metadata.embedder.type).toBe('test');
    expect(metadata).toHaveProperty('hnsw');
    expect(metadata.hnsw.elementCount).toBe(1);
    expect(metadata).toHaveProperty('totalItems', 1);
  });

  test('serialization with toJSON/fromJSON', async () => {
    await service.add('item1', 'hello', { type: 'test1' });
    await service.add('item2', 'world', { type: 'test2' });
    
    const serialized = service.toJSON();
    
    expect(serialized).toHaveProperty('embedder');
    expect(serialized).toHaveProperty('hnsw');
    expect(serialized).toHaveProperty('metadata');
    expect(Object.keys(serialized.metadata)).toHaveLength(2);
    
    // Test restoration
    const newEmbedder = new TestEmbedder(32);
    const restored = EmbeddingService.fromJSON(serialized, newEmbedder);
    
    expect(restored.hnsw.elementCount).toBe(2);
    expect(restored.metadata.size).toBe(2);
    expect(restored.get('item1')).toEqual({ text: 'hello', type: 'test1' });
    expect(restored.get('item2')).toEqual({ text: 'world', type: 'test2' });
  });

  test('search with empty index returns empty array', async () => {
    const results = await service.search('anything');
    
    expect(results).toEqual([]);
  });

  test('multiple items with similar content', async () => {
    // Add multiple similar items
    await service.add('msg1', 'The quick brown fox', { type: 'message' });
    await service.add('msg2', 'The quick brown dog', { type: 'message' });
    await service.add('msg3', 'A slow white cat', { type: 'message' });
    
    const results = await service.search('quick brown', 3);
    
    expect(results.length).toBeGreaterThan(0);
    
    // First results should be more similar (lower distance)
    if (results.length > 1) {
      expect(results[0].distance).toBeLessThanOrEqual(results[1].distance);
    }
  });
});