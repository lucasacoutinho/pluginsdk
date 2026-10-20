import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/native/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 30_000,
    fileParallelism: false
  }
})
