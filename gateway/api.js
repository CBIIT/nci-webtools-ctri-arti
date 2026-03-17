import { createGatewayRouter } from "./http.js";
import { createGatewayService } from "./service.js";

const router = createGatewayRouter({ application: createGatewayService() });

export { createGatewayRouter };
export default router;
