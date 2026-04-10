import { createGatewayService } from "gateway/service.js";

import { createCmsApplication } from "./app.js";
import { ConversationService } from "./core/conversation-service.js";

export function createCmsService({ gateway = createGatewayService(), source = "direct" } = {}) {
  const service = new ConversationService({
    invoke: gateway.invoke,
    embed: gateway.embed,
  });

  return createCmsApplication({
    service,
    source,
  });
}
