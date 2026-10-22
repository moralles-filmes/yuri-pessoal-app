/**
 * MOD-ia-005 — toda rota ou página que chega a um provedor de IA declara `maxDuration`.
 *
 * Sem a declaração, o limite é o padrão da plataforma, e o prazo global do servidor (55 s,
 * `server/prazo.ts`) deixa de ser o que encerra primeiro: a função morre antes, o `finally`
 * não roda e run e tentativa ficam abertos até a lease.
 *
 * Nas PÁGINAS a declaração vale para as Server Actions usadas nelas (é a página que as
 * hospeda): a extração de comprovante e a geração de insight chamam o provedor por ali.
 * Varredura do código-fonte porque o projeto não tem teste de componente.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../..");

const QUEM_CHAMA_O_PROVEDOR = [
  "app/api/ia/chat/route.ts",
  "app/api/cron/insights/route.ts",
  "app/(app)/ia/insights/page.tsx",
  "app/(app)/ia/comprovantes/page.tsx",
] as const;

describe("maxDuration nas rotas que chamam o provedor", () => {
  for (const relativo of QUEM_CHAMA_O_PROVEDOR) {
    it(`${relativo} exporta maxDuration = 60`, () => {
      const codigo = fs.readFileSync(path.join(SRC, relativo), "utf8");
      // `\s*` antes do fim da linha tolera o CRLF que o editor às vezes grava neste repo.
      expect(codigo).toMatch(/^export const maxDuration = 60;\s*$/m);
    });
  }
});
