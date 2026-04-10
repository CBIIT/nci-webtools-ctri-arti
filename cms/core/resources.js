import db, { Resource, Vector } from "database";

import { and, asc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { chunkText } from "shared/chunker.js";
import {
  assertValidEmbedding,
  getEmbeddingsFromResult,
  NOVA_EMBEDDING_MODEL,
  NOVA_INDEX_PURPOSE,
  RESOURCE_CHUNK_OVERLAP,
  RESOURCE_CHUNK_SIZE,
} from "shared/embeddings.js";
import { createNotFoundError, getMutationCount, hasOwn } from "shared/utils.js";

import {
  assertNoLegacyFields,
  requireConversation,
  requireMessage,
  resourceReadCondition,
  resourceWriteCondition,
  stripAutoFields,
} from "./shared.js";

function isTextResource(resource) {
  const encoding = resource?.metadata?.encoding;
  return (
    resource?.type !== "image" &&
    typeof resource.content === "string" &&
    resource.content.length > 0 &&
    encoding !== "base64"
  );
}

async function requireOwnedResource(service, userId, resourceId) {
  const [resource] = await db
    .select()
    .from(Resource)
    .where(and(eq(Resource.id, resourceId), resourceWriteCondition(userId)))
    .limit(1);
  if (!resource) {
    throw createNotFoundError(`Resource not found: ${resourceId}`);
  }
  return resource;
}

function normalizeResourceLinkIds(data = {}) {
  assertNoLegacyFields(data, ["agentID", "conversationID", "messageID"], "Resource input");
  return {
    agentId: data.agentId ?? null,
    conversationId: data.conversationId ?? null,
    messageId: data.messageId ?? null,
  };
}

function resourceRecordToWriteInput(resource = {}) {
  return {
    agentId: resource.agentID ?? null,
    conversationId: resource.conversationID ?? null,
    messageId: resource.messageID ?? null,
    name: resource.name,
    type: resource.type,
    content: resource.content,
    s3Uri: resource.s3Uri ?? null,
    metadata: resource.metadata ?? {},
  };
}

async function normalizeResourceWrite(service, userId, data) {
  const { agentId, conversationId, messageId } = normalizeResourceLinkIds(data);
  const resourceData = {
    userID: userId || null,
    agentID: agentId,
    conversationID: conversationId,
    messageID: messageId,
    name: data.name,
    type: data.type,
    content: data.content,
    s3Uri: data.s3Uri ?? null,
    metadata: data.metadata ?? {},
  };

  if (resourceData.messageID) {
    const message = await requireMessage(service, userId, resourceData.messageID);
    if (
      resourceData.conversationID !== null &&
      Number(resourceData.conversationID) !== Number(message.conversationID)
    ) {
      throw createNotFoundError(
        `Conversation ${resourceData.conversationID} does not own message ${resourceData.messageID}`
      );
    }
    resourceData.conversationID = message.conversationID;
  }

  if (resourceData.conversationID !== null) {
    await requireConversation(service, userId, resourceData.conversationID);
  }

  if (resourceData.agentID !== null) {
    const agent = await service.getAgent(userId, resourceData.agentID);
    if (!agent) {
      throw createNotFoundError(`Agent not found: ${resourceData.agentID}`);
    }
  }

  return resourceData;
}

async function buildResourceVectors(service, userId, resource) {
  if (isTextResource(resource)) {
    const chunks = chunkText(resource.content, {
      chunkSize: RESOURCE_CHUNK_SIZE,
      chunkOverlap: RESOURCE_CHUNK_OVERLAP,
    })
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    if (!chunks.length) return [];

    const result = await service.embedContent({
      userID: userId,
      model: NOVA_EMBEDDING_MODEL,
      content: chunks,
      purpose: NOVA_INDEX_PURPOSE,
      type: "embedding",
    });
    const embeddings = getEmbeddingsFromResult(result, { expectedCount: chunks.length });

    return chunks.map((content, index) => ({
      conversationID: resource.conversationID || null,
      content,
      embedding: embeddings[index],
      order: index,
    }));
  }

  if (resource?.type === "image" && typeof resource.content === "string" && resource.content) {
    const result = await service.embedContent({
      userID: userId,
      model: NOVA_EMBEDDING_MODEL,
      content: [{ image: resource.content }],
      purpose: NOVA_INDEX_PURPOSE,
      type: "embedding",
    });
    const [embedding] = getEmbeddingsFromResult(result, { expectedCount: 1 });

    return [
      {
        conversationID: resource.conversationID || null,
        content: `[Image: ${resource.name}]`,
        embedding,
        order: 0,
      },
    ];
  }

  return [];
}

function shouldReindexResource(existing, updates) {
  if (!existing) return true;
  return (
    (hasOwn(updates, "content") && updates.content !== existing.content) ||
    (hasOwn(updates, "type") && updates.type !== existing.type) ||
    (hasOwn(updates, "conversationID") && updates.conversationID !== existing.conversationID) ||
    (hasOwn(updates, "metadata") &&
      JSON.stringify(updates.metadata || {}) !== JSON.stringify(existing.metadata || {}))
  );
}

export const resourceMethods = {
  async reindexResource(userId, resourceId) {
    const resource = await this.getResource(userId, resourceId);
    if (!resource) return null;

    const vectors = await buildResourceVectors(this, userId, resource);
    await db.transaction(async (tx) => {
      await tx.delete(Vector).where(eq(Vector.resourceID, resourceId));
      if (vectors.length) {
        await tx.insert(Vector).values(
          vectors.map((vector) => ({
            ...vector,
            resourceID: resourceId,
          }))
        );
      }
    });

    return this.getVectorsByResource(userId, resourceId);
  },

  async storeConversationResource(userId, data) {
    const resourceData = await normalizeResourceWrite(this, userId, data);
    const vectors = await buildResourceVectors(this, userId, resourceData);

    return db.transaction(async (tx) => {
      const [resource] = await tx.insert(Resource).values(resourceData).returning();
      if (vectors.length) {
        await tx.insert(Vector).values(
          vectors.map((vector) => ({
            ...vector,
            resourceID: resource.id,
          }))
        );
      }
      return resource;
    });
  },

  async getResource(userId, resourceId) {
    const [resource] = await db
      .select()
      .from(Resource)
      .where(and(eq(Resource.id, resourceId), resourceReadCondition(userId)))
      .limit(1);
    return resource || null;
  },

  async updateConversationResource(userId, resourceId, updates) {
    const existing = await requireOwnedResource(this, userId, resourceId);

    const resourceUpdates = stripAutoFields(updates);
    const nextResource = await normalizeResourceWrite(this, userId, {
      ...resourceRecordToWriteInput(existing),
      ...resourceUpdates,
    });
    const shouldReindex = shouldReindexResource(existing, nextResource);
    const vectors = shouldReindex ? await buildResourceVectors(this, userId, nextResource) : null;

    return db.transaction(async (tx) => {
      const [resource] = await tx
        .update(Resource)
        .set(stripAutoFields(nextResource))
        .where(eq(Resource.id, resourceId))
        .returning();

      if (!resource) return null;

      if (shouldReindex) {
        await tx.delete(Vector).where(eq(Vector.resourceID, resourceId));
        if (vectors?.length) {
          await tx.insert(Vector).values(
            vectors.map((vector) => ({
              ...vector,
              resourceID: resourceId,
            }))
          );
        }
      }

      return resource;
    });
  },

  async getResourcesByAgent(userId, agentId) {
    return db
      .select()
      .from(Resource)
      .where(
        and(eq(Resource.agentID, agentId), or(eq(Resource.userID, userId), isNull(Resource.userID)))
      )
      .orderBy(asc(Resource.createdAt));
  },

  async getResourcesByConversation(userId, conversationId) {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return [];

    return db
      .select()
      .from(Resource)
      .where(and(eq(Resource.conversationID, conversationId), resourceReadCondition(userId)))
      .orderBy(asc(Resource.createdAt));
  },

  async deleteConversationResource(userId, resourceId) {
    await requireOwnedResource(this, userId, resourceId);

    await db.delete(Vector).where(eq(Vector.resourceID, resourceId));
    const result = await db.delete(Resource).where(eq(Resource.id, resourceId));
    return getMutationCount(result);
  },

  async storeConversationVectors(userId, { conversationId, vectors }) {
    await requireConversation(this, userId, conversationId);

    for (const vector of vectors) {
      if (
        vector.conversationID !== null &&
        vector.conversationID !== undefined &&
        Number(vector.conversationID) !== Number(conversationId)
      ) {
        throw createNotFoundError(
          `Vector conversation ${vector.conversationID} does not match ${conversationId}`
        );
      }

      if (vector.resourceID) {
        const resource = await this.getResource(userId, vector.resourceID);
        if (!resource) {
          throw createNotFoundError(`Resource not found: ${vector.resourceID}`);
        }
      }
    }

    const records = vectors.map((vector, index) => ({
      conversationID: vector.conversationID ?? conversationId ?? null,
      resourceID: vector.resourceID || null,
      toolID: vector.toolID || null,
      order: vector.order ?? index,
      content: vector.content,
      embedding:
        hasOwn(vector, "embedding") && vector.embedding !== null && vector.embedding !== undefined
          ? assertValidEmbedding(vector.embedding, {
              message: "Vector embeddings must contain 3072 numeric dimensions",
            })
          : null,
    }));
    return db.insert(Vector).values(records).returning();
  },

  async getVectorsByConversation(userId, conversationId) {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return [];

    return db
      .select()
      .from(Vector)
      .where(eq(Vector.conversationID, conversationId))
      .orderBy(asc(Vector.order));
  },

  async getVectorsByResource(userId, resourceId) {
    const resource = await this.getResource(userId, resourceId);
    if (!resource) return [];

    return db
      .select()
      .from(Vector)
      .where(eq(Vector.resourceID, resourceId))
      .orderBy(asc(Vector.order));
  },

  async searchVectors({ toolId, conversationId, embedding, topN = 10 }) {
    const conditions = [];
    if (toolId) conditions.push(eq(Vector.toolID, toolId));
    if (conversationId) conditions.push(eq(Vector.conversationID, conversationId));
    conditions.push(isNotNull(Vector.embedding));

    if (!embedding) {
      return db
        .select()
        .from(Vector)
        .where(and(...conditions));
    }

    const queryEmbedding = assertValidEmbedding(embedding);
    const queryVector = sql`${sql.param(queryEmbedding, Vector.embedding)}::vector`;
    const distance = sql`${Vector.embedding} <=> ${queryVector}`;

    return db
      .select({
        id: Vector.id,
        conversationID: Vector.conversationID,
        resourceID: Vector.resourceID,
        toolID: Vector.toolID,
        order: Vector.order,
        content: Vector.content,
        embedding: Vector.embedding,
        createdAt: Vector.createdAt,
        updatedAt: Vector.updatedAt,
        similarity: sql`1 - (${distance})`.mapWith(Number).as("similarity"),
      })
      .from(Vector)
      .where(and(...conditions))
      .orderBy(distance)
      .limit(topN);
  },

  async deleteVectorsByResource(userId, resourceId) {
    await requireOwnedResource(this, userId, resourceId);
    const result = await db.delete(Vector).where(eq(Vector.resourceID, resourceId));
    return getMutationCount(result);
  },

  async deleteVectorsByConversation(userId, conversationId) {
    await requireConversation(this, userId, conversationId);
    const result = await db.delete(Vector).where(eq(Vector.conversationID, conversationId));
    return getMutationCount(result);
  },
};
