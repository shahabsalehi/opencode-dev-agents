import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "src/tools/dependency-graph.ts",
        "src/tools/refactor-engine.ts",
        "src/doctor.ts",
      ],
      thresholds: {
        lines: 72,
        functions: 80,
        branches: 56,
        statements: 70,
      },
    },
  }
})
