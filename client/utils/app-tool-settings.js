import { createSignal } from "solid-js";

import { fetchCachedJson } from "./static-data.js";

const [appToolSettings, setAppToolSettings] = createSignal(null);

fetchCachedJson("/api/v1/config")
  .then((config) => setAppToolSettings(config?.appToolSettings || []))
  .catch(() => setAppToolSettings([]));

export { appToolSettings };
