const tests = [
  "./solidjs.test.js",
  "./models/database2.test.js",
  "./models/database-migration.test.js",
  "./utils/similarity.test.js",
  "./pages/tools/chat/message.test.js",
  "./services/consent-library-filter.test.js",
  "./services/consent-form-generator.test.js",
  // "./pages/tools/consent-crafter-v2/index.test.js",
];
for (const test of tests) {
  try {
    await import(test);
  } catch (error) {
    console.error(`Error loading test ${test}:`, error);
  }
}

import { run } from "./test.js";

// Run all tests and await for completion before setting TESTS_DONE
await run();
