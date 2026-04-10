import { createCmsService } from "cms/service.js";
import { createGatewayService } from "gateway/service.js";
import { sendEmail } from "server/integrations/email.js";
import { createUsersApplication } from "users/app.js";

import { createAgentsApplication } from "./app.js";
import { createAgentsChatRouter } from "./http.js";

const gateway = createGatewayService();
const cms = createCmsService({ gateway, source: "internal-http" });
const users = createUsersApplication();
const router = createAgentsChatRouter({
  application: createAgentsApplication({
    source: "internal-http",
    gateway,
    cms,
    users,
    sendEmail,
  }),
});

export { createAgentsChatRouter };
export default router;
