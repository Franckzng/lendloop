import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Convex functions run in an edge-like runtime, not in Node.js.
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
