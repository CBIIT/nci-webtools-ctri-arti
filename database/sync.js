import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, "migrations");
const initSql = readFileSync(resolve(__dirname, "init.sql"), "utf-8");

export function splitStatements(sqlText) {
  return sqlText
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/**
 * Normalizes query results across postgres-js and PGlite:
 * - postgres-js SELECTs resolve to an array of row objects
 * - PGlite exec/query commonly resolves to an array of statement results
 *   where each entry contains a `rows` array
 *
 * @param {unknown} result
 * @returns {Array<Record<string, unknown>>}
 */
export function getResultRows(result) {
  if (!result) return [];

  if (Array.isArray(result)) {
    if (!result.length) return [];

    const first = result[0];
    if (first && typeof first === "object" && Array.isArray(first.rows)) {
      return result.flatMap((entry) => entry.rows ?? []);
    }

    return result;
  }

  if (typeof result === "object" && Array.isArray(result.rows)) {
    return result.rows;
  }

  return [];
}

/**
 * Applies the same database bootstrap path used by the runtime:
 * init SQL first, then every checked-in migration in order.
 *
 * The point of this helper is to remove schema drift, not to maintain
 * a second hand-written schema definition.
 *
 * @param {(statement: string) => Promise<unknown>} exec
 */
export async function pushSchema(exec) {
  await exec(initSql);

  const migrationFiles = readdirSync(migrationsFolder)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const migrationSql = readFileSync(resolve(migrationsFolder, file), "utf-8");
    for (const statement of splitStatements(migrationSql)) {
      await exec(statement);
    }
  }
}
