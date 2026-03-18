import { createUsersApplication } from "./app.js";
import { createUsersRouter } from "./http.js";

const router = createUsersRouter({ application: createUsersApplication() });

export { createUsersRouter };
export default router;
