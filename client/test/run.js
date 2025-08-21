// Import tests using the new test framework
import './solidjs.test.js';

// Page tests
import './pages/tools/chat/message.test.js';

import { run } from './test.js';

// Run all tests and await for completion before setting TESTS_DONE
await run();