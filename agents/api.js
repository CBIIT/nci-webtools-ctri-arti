import { createAgentsApplication } from "./app.js";
import { createAgentsRouter } from "./http.js";

const router = createAgentsRouter({
  application: createAgentsApplication({ source: "internal-http" }),
});

export { createAgentsRouter };
export default router;
