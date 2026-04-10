import { createHash } from "crypto";
import db, { Agent, Guardrail } from "database";

import { eq, inArray, sql } from "drizzle-orm";
import logger from "shared/logger.js";
import { createAppError, createNotFoundError } from "shared/utils.js";

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        const nextValue = stableValue(value[key]);
        if (nextValue !== undefined) result[key] = nextValue;
        return result;
      }, {});
  }
  return value;
}

function normalizeAwsGuardrailName(name) {
  const normalized = String(name || "")
    .replace(/[^0-9A-Za-z_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "guardrail";
}

function buildGuardrailPayload(guardrail) {
  return {
    name: normalizeAwsGuardrailName(guardrail.name),
    description: guardrail.description || undefined,
    blockedInputMessaging: guardrail.blockedInputMessaging,
    blockedOutputsMessaging: guardrail.blockedOutputsMessaging,
    ...(guardrail.policyConfig || {}),
  };
}

function computeSpecHash(guardrail) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(buildGuardrailPayload(guardrail))))
    .digest("hex");
}

async function loadBedrockSdk() {
  loadBedrockSdk.sdkPromise ||= import("@aws-sdk/client-bedrock");
  return loadBedrockSdk.sdkPromise;
}

async function createManagementClient() {
  const { BedrockClient } = await loadBedrockSdk();
  return new BedrockClient({ region: process.env.AWS_REGION || "us-east-1" });
}

async function getGuardrailArn(client, guardrail) {
  if (guardrail.awsGuardrailArn) return guardrail.awsGuardrailArn;
  if (!guardrail.awsGuardrailId) return null;

  const { GetGuardrailCommand } = await loadBedrockSdk();
  const response = await client.send(
    new GetGuardrailCommand({
      guardrailIdentifier: guardrail.awsGuardrailId,
      guardrailVersion: "DRAFT",
    })
  );
  return response?.guardrailArn || null;
}

async function listRemoteGuardrails(client) {
  const { ListGuardrailsCommand } = await loadBedrockSdk();
  const guardrails = [];
  let nextToken;

  do {
    const response = await client.send(new ListGuardrailsCommand({ nextToken }));
    if (Array.isArray(response?.guardrails)) {
      guardrails.push(...response.guardrails);
    }
    nextToken = response?.nextToken;
  } while (nextToken);

  return guardrails;
}

async function findRemoteGuardrailByName(client, name) {
  const normalizedName = normalizeAwsGuardrailName(name);
  const guardrails = await listRemoteGuardrails(client);
  return (
    guardrails.find((guardrail) => normalizeAwsGuardrailName(guardrail?.name) === normalizedName) ||
    null
  );
}

function isDuplicateNameError(error) {
  const message = error?.message || String(error);
  return /already has this name|different name/i.test(message);
}

async function publishGuardrailVersion(client, guardrailId) {
  const { CreateGuardrailVersionCommand } = await loadBedrockSdk();
  const response = await client.send(
    new CreateGuardrailVersionCommand({
      guardrailIdentifier: guardrailId,
    })
  );
  return response?.version || null;
}

async function adoptRemoteGuardrail(guardrail, remoteGuardrail, specHash) {
  const [updated] = await db
    .update(Guardrail)
    .set({
      awsGuardrailId: remoteGuardrail?.id || null,
      awsGuardrailArn: remoteGuardrail?.arn || null,
      awsGuardrailVersion: remoteGuardrail?.version || "DRAFT",
      specHash,
      lastSyncError: null,
    })
    .where(eq(Guardrail.id, guardrail.id))
    .returning();

  return {
    status: "adopted",
    guardrail: updated,
  };
}

async function createRemoteGuardrail(client, guardrail, specHash) {
  const { CreateGuardrailCommand } = await loadBedrockSdk();
  const existingGuardrail = await findRemoteGuardrailByName(client, guardrail.name);
  if (existingGuardrail) {
    return await adoptRemoteGuardrail(guardrail, existingGuardrail, specHash);
  }

  let createResponse;
  try {
    createResponse = await client.send(
      new CreateGuardrailCommand(buildGuardrailPayload(guardrail))
    );
  } catch (error) {
    if (!isDuplicateNameError(error)) throw error;
    const duplicateGuardrail = await findRemoteGuardrailByName(client, guardrail.name);
    if (!duplicateGuardrail) throw error;
    return await adoptRemoteGuardrail(guardrail, duplicateGuardrail, specHash);
  }
  const version = await publishGuardrailVersion(client, createResponse.guardrailId);

  const [updated] = await db
    .update(Guardrail)
    .set({
      awsGuardrailId: createResponse.guardrailId || null,
      awsGuardrailArn: createResponse.guardrailArn || null,
      awsGuardrailVersion: version,
      specHash,
      lastSyncError: null,
    })
    .where(eq(Guardrail.id, guardrail.id))
    .returning();

  return {
    status: "created",
    guardrail: updated,
  };
}

async function updateRemoteGuardrail(client, guardrail, specHash) {
  const { UpdateGuardrailCommand } = await loadBedrockSdk();
  const updateResponse = await client.send(
    new UpdateGuardrailCommand({
      guardrailIdentifier: guardrail.awsGuardrailId,
      ...buildGuardrailPayload(guardrail),
    })
  );
  const version = await publishGuardrailVersion(client, guardrail.awsGuardrailId);

  const [updated] = await db
    .update(Guardrail)
    .set({
      awsGuardrailArn: updateResponse.guardrailArn || guardrail.awsGuardrailArn || null,
      awsGuardrailVersion: version,
      specHash,
      lastSyncError: null,
    })
    .where(eq(Guardrail.id, guardrail.id))
    .returning();

  return {
    status: "updated",
    guardrail: updated,
  };
}

async function markSyncError(guardrailId, error) {
  const message = error?.message || String(error);
  await db
    .update(Guardrail)
    .set({
      lastSyncError: message,
    })
    .where(eq(Guardrail.id, guardrailId));
}

export function toRuntimeGuardrailConfig(guardrail) {
  if (!guardrail?.awsGuardrailId) return null;
  return {
    guardrailIdentifier: guardrail.awsGuardrailId,
    guardrailVersion: guardrail.awsGuardrailVersion || "DRAFT",
  };
}

export async function listGuardrails({ ids } = {}) {
  const where = ids?.length ? inArray(Guardrail.id, ids) : undefined;
  return await db.query.Guardrail.findMany({
    where,
    orderBy: (guardrails, { asc }) => [asc(guardrails.id)],
  });
}

export async function reconcileGuardrails({ ids } = {}) {
  const guardrails = await listGuardrails({ ids });
  if (!guardrails.length) return [];

  const client = await createManagementClient();
  const results = [];

  for (const guardrail of guardrails) {
    const specHash = computeSpecHash(guardrail);
    const needsCreate = !guardrail.awsGuardrailId;
    const needsUpdate =
      !needsCreate && (!guardrail.awsGuardrailVersion || guardrail.specHash !== specHash);

    if (!needsCreate && !needsUpdate) {
      results.push({ status: "unchanged", guardrail });
      continue;
    }

    try {
      const result = needsCreate
        ? await createRemoteGuardrail(client, guardrail, specHash)
        : await updateRemoteGuardrail(client, guardrail, specHash);
      results.push(result);
    } catch (error) {
      await markSyncError(guardrail.id, error);
      logger.error(`Guardrail sync failed for ${guardrail.name}: ${error.message || error}`);
      results.push({
        status: "error",
        guardrail: {
          ...guardrail,
          specHash,
          lastSyncError: error?.message || String(error),
        },
        error: error?.message || String(error),
      });
    }
  }

  return results;
}

export async function deleteGuardrailById(id) {
  const guardrail = await db.query.Guardrail.findFirst({
    where: eq(Guardrail.id, id),
  });
  if (!guardrail) {
    throw createNotFoundError(`Guardrail not found: ${id}`);
  }

  const [{ count }] = await db
    .select({
      count: sql`count(*)::int`,
    })
    .from(Agent)
    .where(eq(Agent.guardrailID, id));
  if (Number(count) > 0) {
    throw createAppError(409, `Guardrail is still assigned to ${count} agent(s)`);
  }

  if (guardrail.awsGuardrailId) {
    const client = await createManagementClient();
    const arn = await getGuardrailArn(client, guardrail);
    if (arn) {
      const { DeleteGuardrailCommand } = await loadBedrockSdk();
      await client.send(
        new DeleteGuardrailCommand({
          guardrailIdentifier: arn,
        })
      );
    }
  }

  await db.delete(Guardrail).where(eq(Guardrail.id, id));
  return { deleted: true, guardrail };
}
