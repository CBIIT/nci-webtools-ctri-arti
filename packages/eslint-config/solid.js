import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: { ...globals.browser }, sourceType: "module" },
    settings: {
      "import/core-modules": ["eslint/config", "solid-js", "solid-js/html", "solid-js/web"],
    },
  },
]);
