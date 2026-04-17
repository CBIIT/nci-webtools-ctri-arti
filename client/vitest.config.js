import solidPlugin from "vite-plugin-solid";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solidPlugin()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest-setup.js"],
    include: ["**/*.test.{js,ts}"],
    exclude: ["test/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["lcov", "json", "html"],
      enabled: true,
      exclude: [
        ...configDefaults.coverage.exclude,
        "test/**",
        "templates/**",
        "assets/**",
        "configs/**",
      ],
    },
    testTimeout: 10_000,
  },
  resolve: {
    conditions: ["development", "browser"],
  },
});
