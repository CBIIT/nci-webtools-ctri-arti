import { json, Router } from "express";
import { logErrors, logRequests } from "shared/middleware.js";
import { parseInternalUserIdHeader } from "shared/request-context.js";
import { routeHandler } from "shared/utils.js";

function readRequestContext(req, { required = true } = {}) {
  try {
    const context = parseInternalUserIdHeader(req.headers["x-user-id"], {
      requestId: req.headers["x-request-id"],
    });

    if (!context && required) {
      const error = new Error("X-User-Id header required");
      error.statusCode = 400;
      throw error;
    }

    return context;
  } catch (error) {
    error.statusCode ||= 400;
    throw error;
  }
}

function withRequestContext(handler, options) {
  return routeHandler(async (req, res) => {
    req.context = readRequestContext(req, options);
    return handler(req, res);
  });
}

async function streamResponse(res, stream) {
  for await (const message of stream) {
    res.write(JSON.stringify(message) + "\n");
  }
  res.end();
}

function parseEmbeddingQuery(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) value = value[0];
  return JSON.parse(value);
}

export function createCmsRouter({ application } = {}) {
  if (!application) {
    throw new Error("cms application is required");
  }

  const v1 = Router();
  v1.use(json({ limit: 1024 ** 3 }));
  v1.use(logRequests());

  v1.post(
    "/agents",
    withRequestContext(async (req, res) => {
      const agent = await application.createAgent(req.context, req.body);
      res.status(201).json(agent);
    })
  );

  v1.get(
    "/agents",
    withRequestContext(async (req, res) => {
      const agents = await application.getAgents(req.context);
      res.json(agents);
    })
  );

  v1.get(
    "/agents/:id",
    withRequestContext(async (req, res) => {
      const agent = await application.getAgent(req.context, req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      res.json(agent);
    })
  );

  v1.put(
    "/agents/:id",
    withRequestContext(async (req, res) => {
      const agent = await application.updateAgent(req.context, req.params.id, req.body);
      res.json(agent);
    })
  );

  v1.delete(
    "/agents/:id",
    withRequestContext(async (req, res) => {
      await application.deleteAgent(req.context, req.params.id);
      res.json({ success: true });
    })
  );

  v1.get(
    "/agents/:agentId/resources",
    withRequestContext(async (req, res) => {
      const resources = await application.getResourcesByAgent(req.context, req.params.agentId);
      res.json(resources);
    })
  );

  v1.post(
    "/conversations",
    withRequestContext(async (req, res) => {
      const conversation = await application.createConversation(req.context, req.body);
      res.status(201).json(conversation);
    })
  );

  v1.get(
    "/conversations",
    withRequestContext(async (req, res) => {
      const conversations = await application.getConversations(req.context, {
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      });
      res.json(conversations);
    })
  );

  v1.get(
    "/conversations/:id",
    withRequestContext(async (req, res) => {
      const conversation = await application.getConversation(req.context, req.params.id);
      if (!conversation) return res.status(404).json({ error: "Conversation not found" });
      res.json(conversation);
    })
  );

  v1.put(
    "/conversations/:id",
    withRequestContext(async (req, res) => {
      const conversation = await application.updateConversation(
        req.context,
        req.params.id,
        req.body
      );
      res.json(conversation);
    })
  );

  v1.delete(
    "/conversations/:id",
    withRequestContext(async (req, res) => {
      await application.deleteConversation(req.context, req.params.id);
      res.json({ success: true });
    })
  );

  v1.get(
    "/conversations/:id/context",
    withRequestContext(async (req, res) => {
      const conversationContext = await application.getContext(req.context, req.params.id, {
        compressed: req.query.compressed === "true",
      });
      if (!conversationContext) return res.status(404).json({ error: "Conversation not found" });
      res.json(conversationContext);
    })
  );

  v1.post(
    "/conversations/:id/summarize",
    withRequestContext(async (req, res) => {
      await streamResponse(res, application.summarize(req.context, req.params.id, req.body));
    })
  );

  v1.post(
    "/summarize",
    withRequestContext(async (req, res) => {
      const { conversationId, ...params } = req.body;
      await streamResponse(res, application.summarize(req.context, conversationId, params));
    })
  );

  v1.get(
    "/conversations/:conversationId/resources",
    withRequestContext(async (req, res) => {
      const resources = await application.getResourcesByConversation(
        req.context,
        req.params.conversationId
      );
      res.json(resources);
    })
  );

  v1.post(
    "/conversations/:conversationId/messages",
    withRequestContext(async (req, res) => {
      const message = await application.appendConversationMessage(req.context, {
        conversationId: Number(req.params.conversationId),
        ...req.body,
      });
      res.status(201).json(message);
    })
  );

  v1.get(
    "/conversations/:conversationId/messages",
    withRequestContext(async (req, res) => {
      const messages = await application.getMessages(req.context, req.params.conversationId);
      res.json(messages);
    })
  );

  v1.get(
    "/messages/:id",
    withRequestContext(async (req, res) => {
      const message = await application.getMessage(req.context, req.params.id);
      if (!message) return res.status(404).json({ error: "Message not found" });
      res.json(message);
    })
  );

  v1.put(
    "/messages/:id",
    withRequestContext(async (req, res) => {
      const message = await application.updateMessage(req.context, req.params.id, req.body);
      if (!message) return res.status(404).json({ error: "Message not found" });
      res.json(message);
    })
  );

  v1.delete(
    "/messages/:id",
    withRequestContext(async (req, res) => {
      await application.deleteMessage(req.context, req.params.id);
      res.json({ success: true });
    })
  );

  v1.post(
    "/tools",
    withRequestContext(
      async (req, res) => {
        const tool = await application.createTool(req.body);
        res.status(201).json(tool);
      },
      { required: false }
    )
  );

  v1.get(
    "/tools",
    withRequestContext(
      async (req, res) => {
        const tools = await application.getTools(req.context);
        res.json(tools);
      },
      { required: false }
    )
  );

  v1.get(
    "/tools/:id",
    withRequestContext(
      async (req, res) => {
        const tool = await application.getTool(req.params.id);
        if (!tool) return res.status(404).json({ error: "Tool not found" });
        res.json(tool);
      },
      { required: false }
    )
  );

  v1.put(
    "/tools/:id",
    withRequestContext(
      async (req, res) => {
        const tool = await application.updateTool(req.params.id, req.body);
        if (!tool) return res.status(404).json({ error: "Tool not found" });
        res.json(tool);
      },
      { required: false }
    )
  );

  v1.delete(
    "/tools/:id",
    withRequestContext(
      async (req, res) => {
        await application.deleteTool(req.params.id);
        res.json({ success: true });
      },
      { required: false }
    )
  );

  v1.post(
    "/prompts",
    withRequestContext(
      async (req, res) => {
        const prompt = await application.createPrompt(req.body);
        res.status(201).json(prompt);
      },
      { required: false }
    )
  );

  v1.get(
    "/prompts",
    withRequestContext(
      async (req, res) => {
        const prompts = await application.getPrompts(req.query);
        res.json(prompts);
      },
      { required: false }
    )
  );

  v1.get(
    "/prompts/:id",
    withRequestContext(
      async (req, res) => {
        const prompt = await application.getPrompt(req.params.id);
        if (!prompt) return res.status(404).json({ error: "Prompt not found" });
        res.json(prompt);
      },
      { required: false }
    )
  );

  v1.put(
    "/prompts/:id",
    withRequestContext(
      async (req, res) => {
        const prompt = await application.updatePrompt(req.params.id, req.body);
        if (!prompt) return res.status(404).json({ error: "Prompt not found" });
        res.json(prompt);
      },
      { required: false }
    )
  );

  v1.delete(
    "/prompts/:id",
    withRequestContext(
      async (req, res) => {
        await application.deletePrompt(req.params.id);
        res.json({ success: true });
      },
      { required: false }
    )
  );

  v1.post(
    "/resources",
    withRequestContext(async (req, res) => {
      const resource = await application.storeConversationResource(req.context, req.body);
      res.status(201).json(resource);
    })
  );

  v1.get(
    "/resources/:id",
    withRequestContext(async (req, res) => {
      const resource = await application.getResource(req.context, req.params.id);
      if (!resource) return res.status(404).json({ error: "Resource not found" });
      res.json(resource);
    })
  );

  v1.put(
    "/resources/:id",
    withRequestContext(async (req, res) => {
      const resource = await application.updateConversationResource(
        req.context,
        req.params.id,
        req.body
      );
      if (!resource) return res.status(404).json({ error: `Resource not found: ${req.params.id}` });
      res.json(resource);
    })
  );

  v1.delete(
    "/resources/:id",
    withRequestContext(async (req, res) => {
      await application.deleteConversationResource(req.context, req.params.id);
      res.json({ success: true });
    })
  );

  v1.post(
    "/vectors",
    withRequestContext(async (req, res) => {
      const vectors = await application.storeConversationVectors(req.context, {
        ...req.body,
        conversationId: req.body?.conversationId ?? req.body?.conversationID,
      });
      res.status(201).json(vectors);
    })
  );

  v1.post(
    "/conversations/:conversationId/vectors",
    withRequestContext(async (req, res) => {
      const vectors = await application.storeConversationVectors(req.context, {
        conversationId: Number(req.params.conversationId),
        vectors: req.body.vectors,
      });
      res.status(201).json(vectors);
    })
  );

  v1.get(
    "/conversations/:conversationId/vectors",
    withRequestContext(async (req, res) => {
      const vectors = await application.getVectorsByConversation(
        req.context,
        req.params.conversationId
      );
      res.json(vectors);
    })
  );

  v1.get(
    "/resources/:resourceId/vectors",
    withRequestContext(async (req, res) => {
      const vectors = await application.getVectorsByResource(req.context, req.params.resourceId);
      res.json(vectors);
    })
  );

  v1.get(
    "/vectors/search",
    withRequestContext(
      async (req, res) => {
        const vectors = await application.searchVectors({
          toolID: req.query.toolID ? Number(req.query.toolID) : undefined,
          conversationID: req.query.conversationID ? Number(req.query.conversationID) : undefined,
          embedding: parseEmbeddingQuery(req.query.embedding),
          topN: req.query.topN ? Number(req.query.topN) : undefined,
        });
        res.json(vectors);
      },
      { required: false }
    )
  );

  v1.delete(
    "/resources/:resourceId/vectors",
    withRequestContext(async (req, res) => {
      await application.deleteVectorsByResource(req.context, req.params.resourceId);
      res.json({ success: true });
    })
  );

  v1.delete(
    "/conversations/:conversationId/vectors",
    withRequestContext(async (req, res) => {
      await application.deleteVectorsByConversation(req.context, req.params.conversationId);
      res.json({ success: true });
    })
  );

  v1.post(
    "/search/messages",
    withRequestContext(async (req, res) => {
      const results = await application.searchMessages(req.context, req.body);
      res.json(results);
    })
  );

  v1.post(
    "/search/vectors",
    withRequestContext(async (req, res) => {
      const results = await application.searchResourceVectors(req.context, req.body);
      res.json(results);
    })
  );

  v1.post(
    "/search/chunks",
    withRequestContext(async (req, res) => {
      const results = await application.searchChunks(req.context, req.body);
      res.json(results);
    })
  );

  v1.use(logErrors());

  return v1;
}
