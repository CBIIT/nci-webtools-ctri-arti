import db, { Conversation, Message, Resource, Vector } from "database";

import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { assertValidEmbedding } from "shared/embeddings.js";

export const searchMethods = {
  async searchMessages(userId, { query, agentId, dateFrom, dateTo, limit = 20 }) {
    const messageText = sql`coalesce((
      SELECT string_agg(elem->>'text', ' ')
      FROM json_array_elements(${Message.content}) AS elem
      WHERE elem->>'text' IS NOT NULL
    ), '')`;
    const tsQuery = sql`plainto_tsquery('english', ${query})`;
    const rank = sql`ts_rank(to_tsvector('english', ${messageText}), ${tsQuery})`;
    const conditions = [
      eq(Conversation.userID, userId),
      eq(Conversation.deleted, false),
      sql`to_tsvector('english', ${messageText}) @@ ${tsQuery}`,
    ];
    if (agentId) conditions.push(eq(Conversation.agentID, agentId));
    if (dateFrom) conditions.push(gte(Message.createdAt, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(Message.createdAt, new Date(dateTo)));

    const rows = await db
      .select({
        messageId: Message.id,
        conversationId: Conversation.id,
        agentId: Conversation.agentID,
        conversationTitle: Conversation.title,
        role: Message.role,
        content: Message.content,
        createdAt: Message.createdAt,
        rank: rank.mapWith(Number).as("rank"),
      })
      .from(Message)
      .innerJoin(Conversation, eq(Message.conversationID, Conversation.id))
      .where(and(...conditions))
      .orderBy(desc(rank), desc(Message.createdAt))
      .limit(limit);

    return rows.map((row) => {
      const texts = (row.content || [])
        .filter((contentBlock) => contentBlock.text)
        .map((contentBlock) => contentBlock.text);
      return { ...row, matchingText: texts.join("\n---\n"), content: undefined };
    });
  },

  async searchResourceVectors(userId, { embedding, topN = 10, dateFrom, dateTo }) {
    const conditions = [isNotNull(Vector.embedding), eq(Resource.userID, userId)];
    if (dateFrom) conditions.push(gte(Vector.createdAt, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(Vector.createdAt, new Date(dateTo)));

    if (!embedding) return [];

    const queryEmbedding = assertValidEmbedding(embedding);
    const queryVector = sql`${sql.param(queryEmbedding, Vector.embedding)}::vector`;
    const distance = sql`${Vector.embedding} <=> ${queryVector}`;

    return db
      .select({
        id: Vector.id,
        resourceId: Resource.id,
        conversationId: Resource.conversationID,
        agentId: Resource.agentID,
        content: Vector.content,
        resourceName: Resource.name,
        resourceType: Resource.type,
        resourceCreatedAt: Resource.createdAt,
        createdAt: Vector.createdAt,
        metadata: Resource.metadata,
        similarity: sql`1 - (${distance})`.mapWith(Number).as("similarity"),
      })
      .from(Vector)
      .innerJoin(Resource, eq(Vector.resourceID, Resource.id))
      .where(and(...conditions))
      .orderBy(distance)
      .limit(topN);
  },

  async searchChunks(userId, { query, dateFrom, dateTo, limit = 20 }) {
    const tsQuery = sql`plainto_tsquery('english', ${query})`;
    const rank = sql`ts_rank(to_tsvector('english', coalesce(${Vector.content}, '')), ${tsQuery})`;

    const conditions = [
      sql`to_tsvector('english', coalesce(${Vector.content}, '')) @@ ${tsQuery}`,
      eq(Resource.userID, userId),
    ];
    if (dateFrom) conditions.push(gte(Vector.createdAt, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(Vector.createdAt, new Date(dateTo)));

    return db
      .select({
        id: Vector.id,
        resourceId: Resource.id,
        conversationId: Resource.conversationID,
        agentId: Resource.agentID,
        content: Vector.content,
        resourceName: Resource.name,
        resourceType: Resource.type,
        resourceCreatedAt: Resource.createdAt,
        createdAt: Vector.createdAt,
        metadata: Resource.metadata,
        rank: rank.mapWith(Number).as("rank"),
      })
      .from(Vector)
      .innerJoin(Resource, eq(Vector.resourceID, Resource.id))
      .where(and(...conditions))
      .orderBy(desc(rank), desc(Vector.createdAt))
      .limit(limit);
  },
};
