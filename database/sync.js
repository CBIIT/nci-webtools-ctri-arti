import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, "migrations");
const initSql = readFileSync(resolve(__dirname, "init.sql"), "utf-8");

function splitStatements(sqlText) {
  return sqlText
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
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
