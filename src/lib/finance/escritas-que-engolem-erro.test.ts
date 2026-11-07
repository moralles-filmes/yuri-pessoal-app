/**
 * REDESIGN-03-G2 (E8, K2) — nenhuma ESCRITA do financeiro descarta ou engole o `error`.
 *
 * O espelho de `leituras-que-engolem-erro.test.ts` com o filtro invertido
 * (`inventariarEscritas`): `insert`/`update`/`upsert`/`delete` e as RPCs de `RPCS_DE_ESCRITA`.
 * Uma escrita nova no escopo que faça `await …update(…)` sem olhar o erro derruba a suíte — e uma
 * exceção sem motivo também. Escrita que ignora o erro é o `ok` que mente (invariante 37: erra
 * para "pode não ter acontecido", nunca para "aconteceu" sem prova); a 03-G2 trocou cada uma por
 * uma das três frases de K2 (`nadaGravado`, `gravadoEmParte`, `desfechoDesconhecido`).
 *
 * ⚠️ A contagem é FIXADA de propósito: um varredor que não lê nada também não acha nada
 * (invariante 106). Se o número mudar sem que o inventário tenha sido conferido, o teste cai.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inventariarEscritas } from "@/test/inventario-de-leituras";

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
 *
 * ⚠️ A chave não distingue duas escritas da MESMA função no MESMO alvo. Por isso cada exceção
 * declara `n`, QUANTAS escritas não tratadas ela cobre: uma escrita nova que ignore o erro na
 * mesma função e no mesmo alvo muda a contagem e derruba o teste, em vez de se esconder atrás da
 * exceção antiga.
 */
const EXCECOES: Record<string, { n: number; motivo: string; destino: string }> = {
  "src/lib/finance/statements.ts · getOrCreateStatementByFatura · card_statements": {
    n: 1,
    motivo:
      "Deliberada: o insert do busca-ou-cria não olha o erro porque uma corrida de unique é resolvida pela releitura logo depois (`exigir`, que lança se a leitura falhar). Se o insert falhou por outro motivo, a releitura volta vazia e a função devolve `null`.",
    destino: "03-G2 §2.3 — declarada; fatura vazia não é dinheiro (D-G2-2).",
  },
  "src/lib/notifications/cron.ts · generateForUser · todo_reminders": {
    n: 1,
    motivo:
      "Não é escrita financeira: fecha o lembrete do TO-DO que já virou notificação. A dupla proteção (dedupe_key + status 'enviado') impede o disparo repetido mesmo que esta escrita falhe.",
    destino: "Fora do escopo da 03-G2 (Fase 15) — o Cron está no escopo só por gerar avisos financeiros.",
  },
  "src/lib/actions/imports.ts · commitImport · import_rows": {
    n: 1,
    motivo:
      "Deliberada (K2/§5.7): o update que grava a frase da action como motivo depois de a criação da linha falhar. Se ESTA escrita falhar, a linha fica com o motivo da reserva ('pode ter sido lançada'), que erra para o lado seguro, e o commit segue. As outras escritas de `import_rows` em `commitImport` tratam o erro (a marca `importada` para o commit com `gravadoEmParte`).",
    destino: "03-G2 K2/§5.7 — declarada.",
  },
  "src/lib/finance/generation.ts · runGeneration · transactions": {
    n: 1,
    motivo:
      "Falso positivo: o `if (!error)` só trata o sucesso; o erro do insert segue para a devolução da reserva, que é conferida e devolve `{ generated, interrompida: true }` se falhar (S9).",
    destino: "varredor (03-G2 E8)",
  },
  "src/lib/finance/generation.ts · runGeneration · recurring_transactions": {
    n: 1,
    motivo:
      "Falso positivo: as escritas de `recurring_transactions` (reserva, devolução e conferência final) devolvem `{ generated, interrompida: true }`, mas o nome `error` é o mesmo do insert de `transactions` na função e o varredor junta os `if` dos dois.",
    destino: "varredor (03-G2 E8)",
  },
  "src/lib/finance/recebimentos-servico.ts · registrarRecebimento · receivable_receipts": {
    n: 1,
    motivo:
      "Falso positivo: `if (error)` devolve `dbError(…)`; o `engolido` vem do `if (error.code === \"23514\")` interno, que só escolhe a frase (saldo mudou × passa do saldo) e também devolve resultado de erro.",
    destino: "varredor (03-G2 E8)",
  },
  "src/lib/finance/recebimentos-servico.ts · decidirRecebivel · receivables": {
    n: 1,
    motivo:
      "Falso positivo: o erro é lido num ternário (`return error ? dbError(…) : { ok: true }`), forma que o varredor, que procura um `if`, não reconhece.",
    destino: "varredor (03-G2 E8)",
  },
  "src/lib/actions/installments.ts · recomputeParentValorPessoal · transactions": {
    n: 1,
    motivo:
      "Falso positivo: o erro é lido num ternário (`return error ? \"escrita\" : \"ok\"`) e o único chamador (`cancelInstallmentFuture`) o traduz na frase de K2 (D-G2-9).",
    destino: "varredor (03-G2 E8)",
  },
  "src/lib/actions/installments.ts · createInstallmentPurchase · criar_compra_parcelada": {
    n: 1,
    motivo:
      "Falso positivo: `if (error || !data)` devolve `traduzirErroDaRpc(…)`; o `engolido` vem do `if` interno que só decide se revalida a tela (erro sem SQLSTATE: a gravação pode ter acontecido).",
    destino: "varredor (03-G2 E8)",
  },
};

/**
 * Medido no E8 da 03-G2 (2026-10-25), depois do E7: 84 escritas no escopo — 77 chamadas
 * `insert`/`update`/`upsert`/`delete` (conferidas por grep) e 7 RPCs de escrita (`salvar_lancamento`
 * ×4, `criar_compra_parcelada`, `pagar_fatura`, `desfazer_pagamento_fatura`). Dessas, 75 tratam o
 * erro e 9 são as exceções acima. Na 04-C (T7) entrou 1: o `update` de `setImportRowReembolso` — 85. Na 04-C (T8) saíram 2: o `insert` e o `update` do ramo `receber` de `aplicarAcaoEmMassa` (o lote não quita mais ninguém) — 83. Mudou? Confira o inventário antes de ajustar.
 */
const ESCRITAS_ESPERADAS = 83;

const ESCRITAS = inventariarEscritas(ARQUIVOS, RAIZ);
const chave = (l: { arquivo: string; funcao: string; alvo: string }) =>
  `${l.arquivo} · ${l.funcao} · ${l.alvo}`;

describe("03-G2 E8 · escritas que engolem o erro", () => {
  it("sanidade: o varredor encontra as escritas do escopo", () => {
    expect(ARQUIVOS.length).toBeGreaterThan(20);
    expect(ESCRITAS.length).toBe(ESCRITAS_ESPERADAS);
  });

  it("nenhuma escrita descarta ou engole o `error` fora das exceções declaradas", () => {
    const achados = ESCRITAS.filter(
      (l) => (l.destino === "descartado" || l.destino === "engolido") && !(chave(l) in EXCECOES),
    ).map((l) => `${l.arquivo}:${l.linha} ${l.funcao} → ${l.alvo} (${l.destino})`);
    expect(achados).toEqual([]);
  });

  it("cada exceção cobre exatamente as `n` escritas que declara", () => {
    const contagem: Record<string, number> = {};
    for (const l of ESCRITAS) {
      if (l.destino !== "descartado" && l.destino !== "engolido") continue;
      contagem[chave(l)] = (contagem[chave(l)] ?? 0) + 1;
    }
    const declarado = Object.fromEntries(Object.entries(EXCECOES).map(([k, e]) => [k, e.n]));
    expect(contagem).toEqual(declarado);
  });

  it("toda exceção tem motivo e destino, e ainda existe no código", () => {
    const chaves = new Set(ESCRITAS.map(chave));
    for (const [k, { motivo, destino }] of Object.entries(EXCECOES)) {
      expect(motivo.length, k).toBeGreaterThan(20);
      expect(destino.length, k).toBeGreaterThan(5);
      expect(chaves.has(k), k).toBe(true);
    }
  });
});
