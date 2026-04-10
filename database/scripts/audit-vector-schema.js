import postgres from "postgres";

import { pgConfig, printJson } from "./shared.js";

const sql = postgres({
  ...pgConfig,
  ssl: false,
  onnotice: () => {},
});

async function main() {
  console.log(
    `Connecting to postgres://${pgConfig.username}@${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`
  );

  const extensions = await sql`
    select extname
    from pg_extension
    where extname in ('vector', 'pg_trgm')
    order by extname
  `;
  printJson("extensions", extensions);

  const [column] = await sql`
    select table_schema, table_name, column_name, data_type, udt_name
    from information_schema.columns
    where table_name = 'Vector' and column_name = 'embedding'
  `;
  printJson("embeddingColumn", column || null);

  const migrations = await sql`
    select id, hash, created_at
    from "drizzle"."__drizzle_migrations"
    order by id
  `;
  printJson("drizzleMigrations", migrations);

  const [sample] = await sql`
    select
      "Vector"."id" as "vectorId",
      "Resource"."id" as "resourceId",
      "Resource"."userID" as "userId",
      "Vector"."embedding"::text as embedding
    from "Vector"
    inner join "Resource" on "Vector"."resourceID" = "Resource"."id"
    where "Vector"."embedding" is not null
      and "Resource"."userID" is not null
    limit 1
  `;

  if (!sample) {
    console.log("sample: null");
    if (column?.udt_name !== "vector") {
      process.exitCode = 1;
    }
    return;
  }

  printJson("sample", sample);

  const [selfProbe] = await sql`
    select ${sample.embedding}::vector <=> ${sample.embedding}::vector as similarity
  `;
  printJson("selfProbe", selfProbe);

  try {
    const rows = await sql`
      select
        "Vector"."id",
        "Resource"."id",
        "Resource"."conversationID",
        "Resource"."agentID",
        "Vector"."content",
        "Resource"."name",
        "Resource"."type",
        "Resource"."createdAt",
        "Vector"."createdAt",
        "Resource"."metadata",
        1 - ("Vector"."embedding" <=> ${sample.embedding}::vector) as "similarity"
      from "Vector"
      inner join "Resource" on "Vector"."resourceID" = "Resource"."id"
      where ("Vector"."embedding" is not null and "Resource"."userID" = ${sample.userId})
      order by "Vector"."embedding" <=> ${sample.embedding}::vector
      limit ${4}
    `;
    printJson("joinedQuery", { ok: true, rowCount: rows.length });
  } catch (error) {
    printJson("joinedQuery", {
      ok: false,
      message: error.message,
      code: error.code,
      hint: error.hint,
    });
    process.exitCode = 1;
  }

  if (column?.udt_name !== "vector") {
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  await sql.end({ timeout: 1 });
}
