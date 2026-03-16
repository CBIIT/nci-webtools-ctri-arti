import db, { Resource, rawSql } from "database";

import { asc } from "drizzle-orm";

import { ConversationService } from "./conversation.js";

const args = new Set(process.argv.slice(2));
const reindexAll = args.has("--all");

const service = new ConversationService();

async function getResources() {
  if (reindexAll) {
    return db.select().from(Resource).orderBy(asc(Resource.id));
  }

  return rawSql`
    SELECT r.*
    FROM "Resource" AS r
    LEFT JOIN "Vector" AS v ON v."resourceID" = r.id
    GROUP BY r.id
    HAVING COUNT(v.id) = 0 OR BOOL_OR(v.embedding IS NULL)
    ORDER BY r.id
  `;
}

const resources = await getResources();
let succeeded = 0;
let failed = 0;

console.log(
  `Reindexing ${resources.length} resource(s) ${reindexAll ? "(all resources)" : "(missing/null embeddings only)"}`
);

for (const resource of resources) {
  try {
    const vectors = await service.reindexResource(resource.userID, resource.id);
    console.log(
      `resource ${resource.id} ${resource.name || "<unnamed>"} -> ${vectors?.length || 0} vector(s)`
    );
    succeeded += 1;
  } catch (error) {
    console.error(
      `resource ${resource.id} ${resource.name || "<unnamed>"} failed: ${error.message}`
    );
    failed += 1;
  }
}

console.log(`Reindex complete. succeeded=${succeeded} failed=${failed}`);
process.exitCode = failed ? 1 : 0;
