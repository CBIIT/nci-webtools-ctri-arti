import { Config } from "./types";

if (!process.env.ENVIRONMENT) {
  const defaultEnvironment = "default";
  console.warn(`No ENVIRONMENT specified. Defaulting to '${defaultEnvironment}'`);
  process.env.ENVIRONMENT = defaultEnvironment;
}
const configModule = require(`./environments/${process.env.ENVIRONMENT}`);
const config: Config = configModule.default;
const { prefix, tier } = configModule;

export { prefix, tier };
export default config;
