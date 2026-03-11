import db, { AgentTool, Tool, UserTool, Vector } from "database";

import { eq } from "drizzle-orm";
import { Router } from "express";
import { routeHandler } from "shared/utils.js";

const router = Router();

router.post(
  "/",
  routeHandler(async (req, res) => {
    const { name, type, description, endpoint, transportationType, customConfig } = req.body;
    if (!name || !type || !description) {
      return res.status(400).json({ error: "name, type, and description are required" });
    }

    const [tool] = await db
      .insert(Tool)
      .values({
        name,
        type,
        description,
        endpoint,
        transportType: transportationType,
        customConfig,
      })
      .returning();

    res.status(201).json(formatTool(tool));
  })
);

router.get(
  "/",
  routeHandler(async (req, res) => {
    const { type } = req.query;
    const allTools = await db.select().from(Tool);
    const filtered = type ? allTools.filter((t) => t.type === type) : allTools;
    res.json(filtered.map(formatTool));
  })
);

router.get(
  "/:id",
  routeHandler(async (req, res) => {
    const [tool] = await db
      .select()
      .from(Tool)
      .where(eq(Tool.id, Number(req.params.id)))
      .limit(1);
    if (!tool) return res.status(404).json({ error: "Tool not found" });
    res.json(formatTool(tool));
  })
);

router.put(
  "/:id",
  routeHandler(async (req, res) => {
    const { name, type, description, endpoint, transportationType, customConfig } = req.body;
    const fieldMap = {
      name,
      type,
      description,
      endpoint,
      transportType: transportationType,
      customConfig,
    };
    const updates = Object.fromEntries(Object.entries(fieldMap).filter(([, v]) => v !== undefined));

    const result = await db
      .update(Tool)
      .set(updates)
      .where(eq(Tool.id, Number(req.params.id)))
      .returning();

    if (result.length === 0) return res.status(404).json({ error: "Tool not found" });
    res.json(formatTool(result[0]));
  })
);

router.delete(
  "/:id",
  routeHandler(async (req, res) => {
    const toolId = Number(req.params.id);
    await db.delete(Vector).where(eq(Vector.toolID, toolId));
    await db.delete(AgentTool).where(eq(AgentTool.toolID, toolId));
    await db.delete(UserTool).where(eq(UserTool.toolID, toolId));
    await db.delete(Tool).where(eq(Tool.id, toolId));
    res.json({ success: true });
  })
);

function formatTool(tool) {
  return {
    toolID: tool.id,
    name: tool.name,
    type: tool.type,
    description: tool.description,
    endpoint: tool.endpoint,
    transportationType: tool.transportType,
    customConfig: tool.customConfig,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  };
}

export default router;
