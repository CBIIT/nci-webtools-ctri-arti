import { defineConfig } from "eslint/config";
import base from "@arti/eslint-config";
import solid from "@arti/eslint-config/solid";

export default defineConfig([{ extends: [base, solid] }]);
