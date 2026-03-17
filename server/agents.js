import { getAgentsModule } from "./compose.js";

export { getAgentsModule };

export async function* chat(...args) {
  yield* (await getAgentsModule()).chat(...args);
}
