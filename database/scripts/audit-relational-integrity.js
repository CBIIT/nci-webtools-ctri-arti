import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import { auditRelationalIntegrity } from "../relational-audit.js";

const config = {
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "postgres",
  username: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
};

function printJson(label, value) {
  console.log(`${label}: ${JSON.stringify(value, null, 2)}`);
}

async function main() {
  console.log(
    `Connecting to postgres://${config.username}@${config.host}:${config.port}/${config.database}`
  );

  const client = postgres({
    ...config,
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
