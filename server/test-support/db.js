import { after } from "node:test";

import { closeDatabase } from "database";

after(async () => {
  await closeDatabase();
});
