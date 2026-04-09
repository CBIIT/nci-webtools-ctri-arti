import { createAgentsApplication } from "./app.js";
import { createAgentsRouter } from "./http.js";
import { sendEmail } from "../server/integrations/email.js";

const router = createAgentsRouter({
  application: createAgentsApplication({ source: "internal-http", sendEmail }),
});

export { createAgentsRouter };
export default router;
