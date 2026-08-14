import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws on import outside a React Server Component, which
      // is the whole point of it — and which makes any module that imports it
      // untestable. Stubbing it here keeps the production guard while letting
      // the tests exercise the module it guards.
      "server-only": new URL("./test/server-only-stub.ts", import.meta.url).pathname,
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
