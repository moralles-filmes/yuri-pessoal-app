import path from "node:path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Vitest — testes de funções puras. Ambiente `node`: não dependem de Supabase nem do
 * runtime do Next.
 *
 * O alias de `server-only` existe porque o pacote real LANÇA quando importado fora do
 * bundle de servidor do Next — é justamente esse comportamento que quebra o build se um
 * componente client alcançar `src/lib/ai/server/`. Sem o alias, a criptografia de
 * credenciais (Fase 18-A) não teria como ser testada. O `next build` continua usando o
 * pacote real; a proteção não é afrouxada, só é contornada dentro do test runner.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
