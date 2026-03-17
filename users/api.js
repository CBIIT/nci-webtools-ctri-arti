import { createUsersRouter } from "./http.js";
import { createUsersService } from "./service.js";

const router = createUsersRouter({ application: createUsersService() });

export { createUsersRouter };
export default router;
