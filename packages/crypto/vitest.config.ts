import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    execArgv: ["--max-old-space-size=8192"],
    maxWorkers: 1,
  },
});
