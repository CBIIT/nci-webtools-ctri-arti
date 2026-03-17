import { createAgentsRouter } from "./http.js";
import { createAgentsService } from "./service.js";

const router = createAgentsRouter({
  application: createAgentsService({ source: "internal-http" }),
});

export { createAgentsRouter };
export default router;
