import { defineConfig } from "eslint/config";
import base from "@arti/eslint-config";
import node from "@arti/eslint-config/node";

export default defineConfig([{ extends: [base, node] }]);
