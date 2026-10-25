/**
 * REDESIGN-03-G (L8, D-G23) — nenhuma leitura do financeiro descarta ou engole o `error`.
 *
 * O mesmo padrão de `quem-escreve-transactions.test.ts` (03-F): uma leitura nova no escopo que
 * faça `const { data } = await …` sem olhar o erro derruba a suíte — e uma exceção sem motivo
 * também. ⚠️ O teste de sanidade fixa QUANTAS leituras o varredor encontra: um varredor que
 * não lê nada também não acha nada (invariante 106).
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inventariarLeituras } from "@/test/inventario-de-leituras";

const RAIZ = join(__dirname, "..", "..", "..");

const ACOES_FINANCEIRAS = [
  "accounts",
  "bills",
  "categories",
  "credit-cards",
  "imports",
  "installments",
  "people",
  "receivables",
  "recurring",
  "statements",
  "transactions",
];

const ARQUIVOS = [
  ...readdirSync(join(RAIZ, "src/lib/finance"))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => `src/lib/finance/${f}`),
  "src/lib/notifications/cron.ts",
  ...ACOES_FINANCEIRAS.map((a) => `src/lib/actions/${a}.ts`),
];

/**
 * As exceções DECLARADAS, por arquivo · função · alvo (a linha muda a cada edição; isto não).
 * Cada uma com o motivo e o destino — exceção sem os dois derruba o teste.
 */
const EXCECOES: Record<string, { motivo: string; destino: string }> = {
  "src/lib/finance/queries.ts · getDailyBalances · transactions": {
    motivo:
      "Com a leitura falha a função devolve `null` e a tela escreve 'sem saldo' — ausência, nunca zero. O que já era tipado continua tipado.",
    destino: "K1 (5) — mantido por decisão do dono.",
  },
  "src/lib/finance/queries.ts · getDailyBalances · account_balance_before": {
    motivo: "A abertura do mesmo saldo diário: sem ela, `null` (um saldo que começa do zero seria mentira).",
    destino: "K1 (5) — mantido, junto da linha acima.",
  },
  "src/lib/finance/queries.ts · getCategoriesEnsureSeed · seed_default_categories": {
    motivo:
      "O seed é idempotente e a leitura seguinte (listaCompleta das categorias) lança se algo falhou: o erro do rpc não decide nada.",
    destino: "D-G24 — permanece assim.",
  },
  "src/lib/actions/installments.ts · recomputeParentValorPessoal · transaction_installments": {
    motivo:
      "Devolve `false` em vez de lançar, e o único chamador (cancelInstallmentFuture) o traduz em falhaDeLeituraDepois antes de gravar valor_pessoal (L6c1).",
    destino: "03-G L6c1 — coberto em leituras-que-decidem.test.ts ('recálculo do valor pessoal').",
  },
  "src/lib/actions/installments.ts · recomputeParentValorPessoal · receivables": {
    motivo: "A mesma função da linha acima: a segunda das duas leituras do recálculo.",
    destino: "03-G L6c1 — coberto pelo mesmo teste.",
  },
};

/**
 * Medido no passo da L8 (2026-10-25): 106. Na integração com a `main` (2026-10-25) entrou a 107ª —
 * as compras das faturas pagas em `lerCaixaDoMes` (gráficos "meus", desenho 2026-10-18), que trata
 * o erro (`{ ok: false }`) e o teto (`leituraComTeto`). Mudou? Confira o inventário antes de ajustar.
 */
const LEITURAS_ESPERADAS = 107;

const LEITURAS = inventariarLeituras(ARQUIVOS, RAIZ);
const chave = (l: { arquivo: string; funcao: string; alvo: string }) =>
  `${l.arquivo} · ${l.funcao} · ${l.alvo}`;

describe("03-G L8 · leituras que engolem o erro", () => {
  it("sanidade: o varredor encontra as leituras do escopo", () => {
    expect(ARQUIVOS.length).toBeGreaterThan(20);
    expect(LEITURAS.length).toBe(LEITURAS_ESPERADAS);
  });

  it("nenhuma leitura descarta ou engole o `error` fora das exceções declaradas", () => {
    const achados = LEITURAS.filter(
      (l) => (l.destino === "descartado" || l.destino === "engolido") && !(chave(l) in EXCECOES),
    ).map((l) => `${l.arquivo}:${l.linha} ${l.funcao} → ${l.alvo} (${l.destino})`);
    expect(achados).toEqual([]);
  });

  it("toda exceção tem motivo e destino, e ainda existe no código", () => {
    const chaves = new Set(LEITURAS.map(chave));
    for (const [k, { motivo, destino }] of Object.entries(EXCECOES)) {
      expect(motivo.length, k).toBeGreaterThan(20);
      expect(destino.length, k).toBeGreaterThan(5);
      expect(chaves.has(k), k).toBe(true);
    }
  });
});
