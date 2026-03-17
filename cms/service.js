import { createGatewayService } from "gateway/service.js";

import { createCmsApplication } from "./app.js";
import { ConversationService } from "./conversation.js";

export function createCmsService({ gateway = createGatewayService(), source = "direct" } = {}) {
  const service = new ConversationService({
    invoke: (...args) => gateway.invoke(...args),
    embed: (...args) => gateway.embed(...args),
  });

  return createCmsApplication({
    service,
    source,
  });
}
