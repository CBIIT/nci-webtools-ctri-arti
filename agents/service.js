import { createCmsService } from "cms/service.js";
import { createGatewayService } from "gateway/service.js";

import { createAgentsApplication } from "./app.js";

export function createAgentsService({
  gateway = createGatewayService(),
  cms,
  source = "direct",
} = {}) {
  const cmsModule = cms || createCmsService({ gateway, source });
  return createAgentsApplication({
    source,
    gateway,
    cms: cmsModule,
  });
}
