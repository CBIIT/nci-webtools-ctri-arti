import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import importPlugin from "eslint-plugin-import-x";
import globals from "globals";

const workspacePackages = ["shared", "database", "gateway", "cms", "agents", "users"];

const cdnModules = [
  "@duckdb/duckdb-wasm",
  "@floating-ui/dom",
  "@huggingface/transformers",
  "@langchain/textsplitters",
  "@popperjs/core",
  "@solidjs/router",
  "bootstrap",
  "docx",
  "docx-templates",
  "dompurify",
  "fast-xml-parser",
  "idb",
  "jszip",
  "lucide-solid",
  "mammoth",
  "marked",
  "onnxruntime-common",
  "onnxruntime-web",
  "pdfjs-dist",
  "solid-js",
  "solid-js/html",
  "solid-js/store",
  "solid-js/web",
  "three",
  "turndown",
  "yaml",
];

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "client/templates/**",
    "infrastructure/**",
    "client/server/**",
    "docs/**",
    "tmp/**",
    "scripts/**",
  ]),

  // Base config for all JS files
  importPlugin.flatConfigs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    settings: {
      "import-x/core-modules": [...workspacePackages, "eslint/config"],
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "import-x/no-named-as-default": "off",
      "import-x/prefer-default-export": "off",
      "import-x/newline-after-import": ["error", { count: 1, considerComments: true }],
      "import-x/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", "parent", ["sibling", "index"]],
          alphabetize: { order: "asc", caseInsensitive: true },
          "newlines-between": "always",
        },
      ],
    },
  },

  // Node override: server-side packages
  {
    files: [
      "server/**/*.js",
      "gateway/**/*.js",
      "cms/**/*.js",
      "shared/**/*.js",
      "database/**/*.js",
      "agents/**/*.js",
      "users/**/*.js",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Browser override: client-side code (excluding client/server/)
  {
    files: ["client/**/*.js"],
    ignores: ["client/server/**"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    settings: {
      "import-x/core-modules": [...workspacePackages, ...cdnModules],
    },
    rules: {
      "import-x/no-unresolved": "off",
      "import-x/named": "off",
    },
  },

  // Test override: relax unused vars for common test parameters
  {
    files: ["**/test/**/*.js", "**/*.test.js"],
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^(_|t|req|res|next)",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);
