import { createUsersApplication } from "./app.js";
import { UserService } from "./user.js";

export function createUsersService({ service = new UserService() } = {}) {
  return createUsersApplication({ service });
}
