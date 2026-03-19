import { createCmsRouter } from "./http.js";
import { createCmsService } from "./service.js";

const v1Router = createCmsRouter({
  application: createCmsService({ source: "internal-http" }),
});

export { createCmsRouter, v1Router };
export default v1Router;
