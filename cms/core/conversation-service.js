import db, { AgentTool, Prompt, Tool, UserTool, Vector } from "database";

import { asc, desc, eq } from "drizzle-orm";

import { agentMethods } from "./agents.js";
import { conversationMethods } from "./conversations.js";
import { resourceMethods } from "./resources.js";
import { searchMethods } from "./search.js";
import { getMutationCount, stripAutoFields } from "./shared.js";

async function missingEmbedDependency() {
  throw new Error("ConversationService embed dependency is required");
}

export class ConversationService {
  constructor({ invoke = null, embed = missingEmbedDependency } = {}) {
    this.invokeModel = invoke;
    this.embedContent = embed;
  }

  async createTool(data) {
    const [tool] = await db.insert(Tool).values(data).returning();
    return tool;
  }

  async getTool(toolId) {
    const [tool] = await db.select().from(Tool).where(eq(Tool.id, toolId)).limit(1);
    return tool || null;
  }

  async getTools(userId) {
    const builtinTools = await db.select().from(Tool).where(eq(Tool.type, "builtin"));
    if (!userId) return builtinTools;

    const userTools = await db.query.Tool.findMany({
      with: { UserTools: true },
    });
    const filteredUserTools = userTools.filter(
      (tool) =>
        tool.type !== "builtin" && tool.UserTools?.some((userTool) => userTool.userID === userId)
    );
    return [...builtinTools, ...filteredUserTools];
  }

  async updateTool(toolId, updates) {
    const result = await db
      .update(Tool)
      .set(stripAutoFields(updates))
      .where(eq(Tool.id, toolId))
      .returning();
    if (result.length === 0) return null;
    return this.getTool(toolId);
  }

  async deleteTool(toolId) {
    await db.delete(Vector).where(eq(Vector.toolID, toolId));
    await db.delete(AgentTool).where(eq(AgentTool.toolID, toolId));
    await db.delete(UserTool).where(eq(UserTool.toolID, toolId));
    const result = await db.delete(Tool).where(eq(Tool.id, toolId));
    return getMutationCount(result);
  }

  async createPrompt(data) {
    const [prompt] = await db.insert(Prompt).values(data).returning();
    return prompt;
  }

  async getPrompt(promptId) {
    const [prompt] = await db.select().from(Prompt).where(eq(Prompt.id, promptId)).limit(1);
    return prompt || null;
  }

  async getPrompts(_options = {}) {
    return db.select().from(Prompt).orderBy(asc(Prompt.name), desc(Prompt.version));
  }

  async updatePrompt(promptId, updates) {
    const result = await db
      .update(Prompt)
      .set(stripAutoFields(updates))
      .where(eq(Prompt.id, promptId))
      .returning();
    if (result.length === 0) return null;
    return this.getPrompt(promptId);
  }

  async deletePrompt(promptId) {
    const result = await db.delete(Prompt).where(eq(Prompt.id, promptId));
    return getMutationCount(result);
  }
}

// Keep the public service surface stable while grouping implementation by domain.
Object.assign(
  ConversationService.prototype,
  agentMethods,
  conversationMethods,
  resourceMethods,
  searchMethods
);
