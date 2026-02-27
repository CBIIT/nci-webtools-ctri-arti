import assert from '../../../assert.js';
import test from '../../../test.js';

// import { createEmbedder } from "../../utils/similarity.js";
import { createEmbedder } from "/utils/similarity.js";

test('Similarity Tests', async (t) => {
  await t.test('creates embedder', async () => {
    const embedder = await createEmbedder("minishlab/potion-base-8M");
    const embeddings = await embedder(["hello", "world"]);
    console.log('embeddings', embeddings);
    assert.ok(embedder, 'Embedder should be created successfully');
    assert.ok(Array.isArray(embeddings), 'Embeddings should be an array');
    assert.strictEqual(embeddings.length, 2, 'Should return embeddings for both inputs');
  });
  
});