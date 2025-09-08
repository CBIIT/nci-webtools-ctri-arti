import base from "@arti/eslint-config";
import solid from "@arti/eslint-config/solid";
import { defineConfig } from "eslint/config";

export default defineConfig([{ extends: [base, solid] }]);
