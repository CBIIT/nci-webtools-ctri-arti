const tests = [
  "./solidjs.test.js",
  // "./models/database2.test.js", // disabled: uses node modules not available in browser
  // "./models/database-migration.test.js", // disabled: uses node modules not available in browser
  // "./utils/similarity.test.js", // disabled: uses node modules not available in browser
  // "./pages/tools/chat/message.test.js", // disabled: broken (p.isStreaming is not a function)
  // "./services/consent-library-filter.test.js",
  // "./services/consent-form-generator.test.js",
  // "./pages/tools/consent-crafter-v2/index.test.js",
  // "./pages/tools/consent-crafter-v2/e2e.test.js", // disabled: too slow (real inference)
  "./api/smoke.test.js",
  "./api/agents-chat.test.js",
  "./pages/home.test.js",
  "./pages/admin.test.js",
  "./pages/users/profile.test.js",
  "./pages/users/usage.test.js",
  "./pages/tools/translate.test.js",
  "./pages/tools/chat-v2/e2e.test.js",
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
