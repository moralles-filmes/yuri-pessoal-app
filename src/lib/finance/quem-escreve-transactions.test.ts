/**
 * REDESIGN-03-E · K0 — quem ESCREVE em `transactions`.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ `transactions.liquidado_em` tem um CHECK: só existe com status `pago`/`recebido`.     ║
 * ║ Todo caminho que escreve na tabela precisa decidir o que fazer com a coluna — e o     ║
 * ║ inventário desses caminhos é este arquivo. Uma escrita nova deixa a suíte vermelha    ║
 * ║ até alguém declarar o arquivo, a contagem e o MOTIVO (e, se ela muda status de        ║
 * ║ lançamento existente, `mudaStatus: true` — o que exige que o arquivo conheça a        ║
 * ║ coluna).                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Os dois caminhos que MUDAM o status de um lançamento já gravado são `updateTransaction` e
 * `setTransactionStatus` (fato 2 do desenho): ambos em `lib/actions/transactions.ts`. Os outros
 * inserem (o status já nasce coerente com a data) ou atualizam colunas que não são o status.
 *
 * ⚠️ Varredura TEXTUAL, como `quem-apaga-recebiveis.test.ts`, mas MULTILINHA: uma escrita é um
 * `.from("transactions")` seguido, antes do próximo `.from(` ou de `;`, de `.insert(`, `.update(`,
 * `.upsert(` ou `.delete(`. A prova de comportamento de cada ponto é o teste de harness dele.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "..");

type Escrita = { quantidade: number; motivo: string; mudaStatus: boolean };

/** `arquivo relativo a src/` → quantas escritas em `transactions`, e por que existem. */
const ESCRITAS: Record<string, Escrita> = {
  "lib/actions/bills.ts": {
    quantidade: 1,
    motivo: "gera o lançamento PENDENTE da conta a pagar (insert; nasce sem data de pagamento)",
    mudaStatus: false,
  },
  "lib/actions/imports.ts": {
    quantidade: 2,
    motivo: "insert do estorno de cartão da importação (receita com cartão: nunca guarda a data) e undoImportBatch (delete do lote)",
    mudaStatus: false,
  },
  "lib/actions/installments.ts": {
    quantidade: 8,
    motivo: "compra parcelada: compra-pai, compensações da criação, edição e cancelamento — cartão nunca guarda a data",
    mudaStatus: false,
  },
  "lib/actions/statements.ts": {
    quantidade: 1,
    motivo:
      "moveTransactionToStatement reatribui statement_id sem tocar status — pagar e desfazer escrevem pelas RPCs pagar_fatura e desfazer_pagamento_fatura (M-F)",
    mudaStatus: false,
  },
  "lib/actions/transactions.ts": {
    quantidade: 7,
    motivo:
      "updateTransaction (grupo/lançamento que vira transferência e o update simples) e setTransactionStatus (por grupo e por id): os DOIS caminhos que mudam o status e por isso limpam liquidado_em",
    mudaStatus: true,
  },
  "lib/finance/generation.ts": {
    quantidade: 1,
    motivo: "geração de lançamentos recorrentes (insert em lote): nasce sem data de pagamento",
    mudaStatus: false,
  },
  "lib/finance/services.ts": {
    quantidade: 5,
    motivo: "criarTransacao (insert), compensações, valor_pessoal e excluirTransacaoSimples (desfazer da IA)",
    mudaStatus: false,
  },
  "lib/finance/split-reapply.ts": {
    quantidade: 2,
    motivo: "reapplySplit: só mexe em valor_pessoal e classificação",
    mudaStatus: false,
  },
};

const ESCRITA = /\.(insert|update|upsert|delete)\(/;
const FROM_TRANSACTIONS = /\.from\(\s*["']transactions["']\s*\)/g;

function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function arquivosDeProducao(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return arquivosDeProducao(caminho);
    return /\.(ts|tsx)$/.test(entrada.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entrada.name)
      ? [caminho]
      : [];
  });
}

/** Quantas vezes o código abre `.from("transactions")` e, até o fim da cadeia, escreve. */
function escritasEmTransactions(codigo: string): number {
  let n = 0;
  for (const m of codigo.matchAll(FROM_TRANSACTIONS)) {
    const resto = codigo.slice((m.index ?? 0) + m[0].length);
    const fimDaCadeia = resto.search(/\.from\(|;/);
    const cadeia = fimDaCadeia === -1 ? resto : resto.slice(0, fimDaCadeia);
    if (ESCRITA.test(cadeia)) n += 1;
  }
  return n;
}

const VARRIDOS = arquivosDeProducao(SRC).map((arquivo) => ({
  caminho: path.relative(SRC, arquivo).split(path.sep).join("/"),
  codigo: semComentarios(fs.readFileSync(arquivo, "utf8")),
}));

const CONTAGEM: Record<string, number> = {};
for (const { caminho, codigo } of VARRIDOS) {
  const n = escritasEmTransactions(codigo);
  if (n > 0) CONTAGEM[caminho] = n;
}

describe("03-E · K0 — quem escreve em transactions", () => {
  it("a varredura alcança o código de produção — não afirma [] === []", () => {
    expect(VARRIDOS.length).toBeGreaterThan(700);
    expect(Object.keys(CONTAGEM).length).toBeGreaterThan(0);
  });

  it("toda escrita em transactions está declarada, com a contagem exata", () => {
    expect(CONTAGEM).toEqual(
      Object.fromEntries(Object.entries(ESCRITAS).map(([arquivo, e]) => [arquivo, e.quantidade])),
    );
  });

  it("toda entrada tem motivo", () => {
    for (const [arquivo, e] of Object.entries(ESCRITAS)) {
      expect(e.motivo.trim().length, arquivo).toBeGreaterThan(10);
    }
  });

  it("não há entrada fantasma: todo arquivo declarado existe", () => {
    const caminhos = new Set(VARRIDOS.map((v) => v.caminho));
    for (const arquivo of Object.keys(ESCRITAS)) {
      expect(caminhos.has(arquivo), arquivo).toBe(true);
    }
  });

  it("só updateTransaction e setTransactionStatus mudam o status — e o arquivo deles conhece liquidado_em", () => {
    const mudam = Object.entries(ESCRITAS)
      .filter(([, e]) => e.mudaStatus)
      .map(([arquivo]) => arquivo);
    expect(mudam).toEqual(["lib/actions/transactions.ts"]);
    for (const arquivo of mudam) {
      const codigo = VARRIDOS.find((v) => v.caminho === arquivo)?.codigo ?? "";
      expect(codigo, arquivo).toContain("liquidado_em");
    }
  });
});

/**
 * REDESIGN-03-F · A1 — a escrita também mora em FUNÇÃO SQL desde a M-F. A varredura de `src/`
 * não a enxerga, então as funções têm o próprio inventário: cada `insert into`, `update` ou
 * `delete from` em `public.transactions` dentro do corpo de um `create function` declarado por
 * arquivo, com o motivo. Migration de dado fora de função (ex.: a da transferência em uma linha)
 * não entra: ela rodou uma vez e não é um caminho.
 */
const MIGRATIONS = path.resolve(SRC, "..", "supabase", "migrations");

/** `arquivo de migration` → quantas escritas em `transactions` DENTRO de funções, e por quê. */
const ESCRITAS_SQL: Record<string, { quantidade: number; motivo: string }> = {
  "20261021120000_pagamento_fatura_atomico.sql": {
    quantidade: 2,
    motivo:
      "pagar_fatura insere o pagamento (nasce pago, com liquidado_em, coerente com o CHECK); desfazer_pagamento_fatura o apaga",
  },
};

const ESCRITA_SQL = /\b(insert\s+into|update|delete\s+from)\s+(public\.)?transactions\b/g;

function escritasEmFuncoes(sql: string): number {
  const limpo = sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
  let n = 0;
  for (const m of limpo.matchAll(/create\s+(or\s+replace\s+)?function/g)) {
    const abre = limpo.indexOf("$$", m.index ?? 0);
    const fecha = abre < 0 ? -1 : limpo.indexOf("$$", abre + 2);
    if (fecha < 0) continue;
    n += (limpo.slice(abre, fecha).match(ESCRITA_SQL) ?? []).length;
  }
  return n;
}

const SQL_VARRIDOS = fs
  .readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({ arquivo: f, n: escritasEmFuncoes(fs.readFileSync(path.join(MIGRATIONS, f), "utf8")) }));

describe("03-F · A1 — quem escreve em transactions de dentro de uma função SQL", () => {
  it("a varredura alcança as migrations — não afirma [] === []", () => {
    expect(SQL_VARRIDOS.length).toBeGreaterThan(100);
  });

  it("toda função que escreve em transactions está declarada, com a contagem exata", () => {
    const contagem = Object.fromEntries(
      SQL_VARRIDOS.filter((v) => v.n > 0).map((v) => [v.arquivo, v.n]),
    );
    expect(contagem).toEqual(
      Object.fromEntries(Object.entries(ESCRITAS_SQL).map(([f, e]) => [f, e.quantidade])),
    );
  });

  it("toda entrada tem motivo", () => {
    for (const [arquivo, e] of Object.entries(ESCRITAS_SQL)) {
      expect(e.motivo.trim().length, arquivo).toBeGreaterThan(10);
    }
  });
});
