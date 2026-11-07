import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 12000,
    hookTimeout: 15000,
    fileParallelism: false,
  },
});
