import { sql } from "drizzle-orm";

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

function normalizeRows(result) {
  return Array.isArray(result) ? result : (result?.rows ?? []);
}

async function executeRows(db, statement) {
  return normalizeRows(await db.execute(sql.raw(statement)));
}

export const REQUIRED_FOREIGN_KEYS = [
  { childTable: "User", childColumn: "roleID", parentTable: "Role", parentColumn: "id" },
  { childTable: "RolePolicy", childColumn: "roleID", parentTable: "Role", parentColumn: "id" },
  { childTable: "RolePolicy", childColumn: "policyID", parentTable: "Policy", parentColumn: "id" },
  { childTable: "Model", childColumn: "providerID", parentTable: "Provider", parentColumn: "id" },
  { childTable: "Usage", childColumn: "userID", parentTable: "User", parentColumn: "id" },
  { childTable: "Usage", childColumn: "modelID", parentTable: "Model", parentColumn: "id" },
  { childTable: "Usage", childColumn: "agentID", parentTable: "Agent", parentColumn: "id" },
  { childTable: "Usage", childColumn: "messageID", parentTable: "Message", parentColumn: "id" },
  { childTable: "Agent", childColumn: "userID", parentTable: "User", parentColumn: "id" },
  { childTable: "Agent", childColumn: "modelID", parentTable: "Model", parentColumn: "id" },
  { childTable: "Agent", childColumn: "promptID", parentTable: "Prompt", parentColumn: "id" },
  { childTable: "Agent", childColumn: "guardrailID", parentTable: "Guardrail", parentColumn: "id" },
  { childTable: "Conversation", childColumn: "userID", parentTable: "User", parentColumn: "id" },
  { childTable: "Conversation", childColumn: "agentID", parentTable: "Agent", parentColumn: "id" },
  { childTable: "Conversation", childColumn: "summaryMessageID", parentTable: "Message", parentColumn: "id" },
  { childTable: "Message", childColumn: "conversationID", parentTable: "Conversation", parentColumn: "id" },
  { childTable: "Message", childColumn: "parentID", parentTable: "Message", parentColumn: "id" },
  { childTable: "Resource", childColumn: "userID", parentTable: "User", parentColumn: "id" },
  { childTable: "Resource", childColumn: "agentID", parentTable: "Agent", parentColumn: "id" },
  { childTable: "Resource", childColumn: "conversationID", parentTable: "Conversation", parentColumn: "id" },
  { childTable: "Resource", childColumn: "messageID", parentTable: "Message", parentColumn: "id" },
  { childTable: "Vector", childColumn: "conversationID", parentTable: "Conversation", parentColumn: "id" },
  { childTable: "Vector", childColumn: "resourceID", parentTable: "Resource", parentColumn: "id" },
  { childTable: "Vector", childColumn: "toolID", parentTable: "Tool", parentColumn: "id" },
  { childTable: "UserAgent", childColumn: "userID", parentTable: "User", parentColumn: "id" },
  { childTable: "UserAgent", childColumn: "agentID", parentTable: "Agent", parentColumn: "id" },
  { childTable: "UserTool", childColumn: "userID", parentTable: "User", parentColumn: "id" },
  { childTable: "UserTool", childColumn: "toolID", parentTable: "Tool", parentColumn: "id" },
  { childTable: "AgentTool", childColumn: "toolID", parentTable: "Tool", parentColumn: "id" },
  { childTable: "AgentTool", childColumn: "agentID", parentTable: "Agent", parentColumn: "id" },
];

export const RECOMMENDED_NOT_NULL_COLUMNS = [
  {
    table: "Conversation",
    column: "userID",
    reason: "conversations are always owned by a concrete user account",
  },
  {
    table: "Message",
    column: "conversationID",
    reason: "message rows are meaningless outside a conversation",
  },
  {
    table: "RolePolicy",
    column: "roleID",
    reason: "policy junction rows must point at a concrete role",
  },
  {
    table: "RolePolicy",
    column: "policyID",
    reason: "policy junction rows must point at a concrete policy",
  },
  {
    table: "UserAgent",
    column: "userID",
    reason: "user-agent junction rows must point at a concrete user",
  },
  {
    table: "UserAgent",
    column: "agentID",
    reason: "user-agent junction rows must point at a concrete agent",
  },
  {
    table: "UserTool",
    column: "userID",
    reason: "user-tool junction rows must point at a concrete user",
  },
  {
    table: "UserTool",
    column: "toolID",
    reason: "user-tool junction rows must point at a concrete tool",
  },
  {
    table: "AgentTool",
    column: "toolID",
    reason: "agent-tool junction rows must point at a concrete tool",
  },
  {
    table: "AgentTool",
    column: "agentID",
    reason: "agent-tool junction rows must point at a concrete agent",
  },
];

export async function listForeignKeys(db) {
  return executeRows(
    db,
    `
      select
        tc.constraint_name as "constraintName",
        tc.table_name as "childTable",
        kcu.column_name as "childColumn",
        ccu.table_name as "parentTable",
        ccu.column_name as "parentColumn"
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on tc.constraint_name = ccu.constraint_name
       and tc.table_schema = ccu.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
      order by tc.table_name, kcu.column_name
    `
  );
}

export async function countOrphanedRows(db, edge) {
  const childTable = quoteIdentifier(edge.childTable);
  const childColumn = quoteIdentifier(edge.childColumn);
  const parentTable = quoteIdentifier(edge.parentTable);
  const parentColumn = quoteIdentifier(edge.parentColumn);
  const [row] = await executeRows(
    db,
    `
      select count(*)::int as count
      from ${childTable} child
      left join ${parentTable} parent
        on child.${childColumn} = parent.${parentColumn}
      where child.${childColumn} is not null
        and parent.${parentColumn} is null
    `
  );
  return row?.count ?? 0;
}

export async function countNullColumnRows(db, descriptor) {
  const table = quoteIdentifier(descriptor.table);
  const column = quoteIdentifier(descriptor.column);
  const [row] = await executeRows(
    db,
    `
      select count(*)::int as count
      from ${table}
      where ${column} is null
    `
  );
  return row?.count ?? 0;
}

export async function auditRelationalIntegrity(db, options = {}) {
  const expectedForeignKeys = options.requiredForeignKeys ?? REQUIRED_FOREIGN_KEYS;
  const recommendedNotNull = options.recommendedNotNull ?? RECOMMENDED_NOT_NULL_COLUMNS;

  const foreignKeys = await listForeignKeys(db);
  const missingForeignKeys = expectedForeignKeys.filter(
    (expected) =>
      !foreignKeys.some(
        (actual) =>
          actual.childTable === expected.childTable &&
          actual.childColumn === expected.childColumn &&
          actual.parentTable === expected.parentTable &&
          actual.parentColumn === expected.parentColumn
      )
  );

  const orphanedRows = [];
  for (const edge of expectedForeignKeys) {
    const count = await countOrphanedRows(db, edge);
    orphanedRows.push({ ...edge, count });
  }

  const nullableViolations = [];
  for (const descriptor of recommendedNotNull) {
    const count = await countNullColumnRows(db, descriptor);
    nullableViolations.push({ ...descriptor, count });
  }

  return {
    foreignKeys,
    missingForeignKeys,
    orphanedRows,
    nullableViolations,
  };
}
