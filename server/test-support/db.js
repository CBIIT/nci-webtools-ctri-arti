import { closeDatabase } from "database";
import { after } from "node:test";

after(async () => {
  await closeDatabase();
});
