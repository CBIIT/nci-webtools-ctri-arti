try {
  const tests = [
    './solidjs.test.js',
    './models/database2.test.js',
    './models/database-migration.test.js',
    './utils/similarity.test.js',
    './pages/tools/chat/message.test.js',
  ];
  for (const test of tests) {
    await import(test);
  }
} catch (error) {
  console.error('Error loading test:', error);
}

import { run } from './test.js';

// Run all tests and await for completion before setting TESTS_DONE
await run();
