import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Vitest — testes de funções puras (formatação e recorrência da Fase 02).
 * Ambiente `node`: não dependem de Supabase nem do runtime do Next.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
