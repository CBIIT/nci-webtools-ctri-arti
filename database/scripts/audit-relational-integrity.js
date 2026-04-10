import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { auditRelationalIntegrity } from "../relational-audit.js";

import { pgConfig, printJson } from "./shared.js";

async function main() {
  console.log(
    `Connecting to postgres://${pgConfig.username}@${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`
  );

  const client = postgres({
    ...pgConfig,
    ssl: false,
    onnotice: () => {},
  });

  try {
    const db = drizzle(client);
    const audit = await auditRelationalIntegrity(db);

    printJson("missingForeignKeys", audit.missingForeignKeys);
    printJson(
      "orphanedRows",
      audit.orphanedRows.filter((entry) => entry.count > 0)
    );
    printJson(
      "nullableViolations",
      audit.nullableViolations.filter((entry) => entry.count > 0)
    );

    if (audit.orphanedRows.some((entry) => entry.count > 0)) {
      process.exitCode = 1;
    }

    if (audit.nullableViolations.some((entry) => entry.count > 0)) {
      process.exitCode = 1;
    }
  } finally {
    await client.end({ timeout: 1 });
  }
}

await main();
