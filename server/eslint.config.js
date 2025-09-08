import base from "@arti/eslint-config";
import node from "@arti/eslint-config/node";
import { defineConfig } from "eslint/config";

export default defineConfig([{ extends: [base, node] }]);
