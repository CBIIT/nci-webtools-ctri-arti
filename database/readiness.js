import { readdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import { rawSql } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, "migrations");

function getExpectedSchemaVersion() {
  const migrationFiles = readdirSync(migrationsFolder)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  return migrationFiles.at(-1) ?? null;
}

function getErrorMessage(error) {
  return error?.cause?.message || error?.message || String(error);
}

export async function getSchemaReadiness() {
  const expectedVersion = getExpectedSchemaVersion();

  try {
    const [state] = await rawSql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Migration'
      ) AS "exists"
    `;

    if (!state?.exists) {
      return {
        ready: false,
        expectedVersion,
        version: null,
        completedAt: null,
        error: null,
      };
    }

    const [row] =
      await rawSql`SELECT "name", "appliedAt" FROM "Migration" ORDER BY "name" DESC LIMIT 1`;

    return {
      ready: !expectedVersion || row?.name === expectedVersion,
      expectedVersion,
      version: row?.name ?? null,
      completedAt: row?.appliedAt ?? null,
      error: null,
    };
  } catch (error) {
    return {
      ready: false,
      expectedVersion,
      version: null,
      completedAt: null,
      error: getErrorMessage(error),
    };
  }
}

export async function waitForSchemaReady({ timeoutMs = 120000, pollMs = 1000 } = {}) {
  const startedAt = Date.now();
  let lastReadiness = null;

  while (Date.now() - startedAt < timeoutMs) {
    lastReadiness = await getSchemaReadiness();
    if (lastReadiness.ready) {
      return lastReadiness;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(
    `Database schema not ready before timeout. expected=${lastReadiness?.expectedVersion ?? "unknown"} actual=${lastReadiness?.version ?? "none"}`
  );
}
