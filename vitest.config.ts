/**
 * Config de teste ISOLADA da build da aplicação — de propósito não importa
 * vite.config.ts (que carrega TanStack Start/Nitro via
 * @lovable.dev/vite-tanstack-config). Os módulos testados aqui são funções
 * puras de src/lib/finance/, sem dependência de React/servidor/Supabase, então
 * só precisamos do alias de path `@/` (mesmo do tsconfig) — nada mais.
 */
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
