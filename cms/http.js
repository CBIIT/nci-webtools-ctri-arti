import { Router } from "express";
import { logErrors, logRequests } from "shared/middleware.js";

import { createCmsAgentsRouter } from "./http/agents.js";
import { createCmsConversationsRouter } from "./http/conversations.js";
import { createCmsSearchRouter } from "./http/search.js";
import { createCmsToolsRouter } from "./http/tools.js";

export { createCmsAgentsRouter } from "./http/agents.js";
export { createCmsConversationsRouter } from "./http/conversations.js";

export function createCmsRouter({ application } = {}) {
  if (!application) {
    throw new Error("cms application is required");
  }

  const v1 = Router();
  v1.use(logRequests());
  v1.use(createCmsAgentsRouter({ application }));
  v1.use(createCmsConversationsRouter({ application }));
  v1.use(createCmsToolsRouter({ application }));
  v1.use(createCmsSearchRouter({ application }));
  v1.use(logErrors());

  return v1;
}





