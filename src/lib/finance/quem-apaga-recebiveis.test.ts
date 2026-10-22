/**
 * REDESIGN-03-D · RR-D-17 — quem APAGA na cadeia que leva ao recebimento.
 *
 * ⛔ O F4 do desenho listou cinco pontos de exclusão e esqueceu dois (`deleteInstallmentPurchase`
 * e a edição que vira transferência): a revisão final achou o furo lendo o código. Este teste
 * transforma o inventário em propriedade verificada — todo `.from(<tabela>).delete(` sobre as
 * tabelas cujo delete alcança `receivable_receipts` (direto ou por cascade) tem de estar na
 * allowlist, por arquivo e tabela, com a contagem exata e o motivo. Um delete novo deixa a suíte
 * vermelha até alguém decidir se ele protege o recebimento.
 *
 * Cadeia (FKs das migrations): transactions → transaction_installments / shared_expenses (cascade)
 * → receivables (cascade) → receivable_receipts (cascade, FK composta da M1).
 *
 * ⚠️ Desde a 03-F, o pagamento de fatura é apagado DENTRO da função SQL
 * `desfazer_pagamento_fatura`, que esta varredura de `src/` não enxerga. Ele não alcança
 * recebimento: a função só apaga um lançamento com a forma de pagamento (transferência, que não é
 * divisível — D-F7, travado por `m-f-pagamento-fatura.test.ts`), e o inventário de funções SQL
 * de `quem-escreve-transactions.test.ts` fica vermelho com qualquer escrita nova.
 *
 * ⚠️ Varredura TEXTUAL, como `quem-le-os-recebimentos.test.ts`. A prova de comportamento de cada
 * ponto protegido é o teste de harness dele.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "..");
const DELETE =
  /\.from\(\s*["'](transactions|transaction_installments|shared_expenses|receivables|receivable_receipts)["']\s*\)\s*\.delete\(/g;

/** `arquivo relativo a src/ · tabela` → quantos deletes, e por que cada um pode existir. */
const ALLOWLIST: Record<string, { n: number; porque: string }> = {
  "lib/actions/imports.ts · transactions": {
    n: 1,
    porque: "undoImportBatch — protegido (regra cheia, A4)",
  },
  "lib/actions/installments.ts · transactions": {
    n: 4,
    porque:
      "três compensações da criação (o pai acabou de nascer, sem recebimento possível) + deleteInstallmentPurchase — protegido (RR-D-17)",
  },
  "lib/actions/installments.ts · receivables": {
    n: 1,
    porque: "cancelInstallmentFuture — protegido (regra cheia, A4)",
  },
  "lib/actions/transactions.ts · transactions": {
    n: 4,
    porque:
      "updateTransaction (grupo e lançamento que vira transferência, RR-D-17) e deleteTransaction (grupo e lançamento, decisão (b)) — protegidos",
  },
  "lib/finance/recebimentos-servico.ts · receivable_receipts": {
    n: 2,
    porque: "desfazer o último recebimento (um e em lote) — a ÚNICA remoção de recebimento, de propósito (K1)",
  },
  "lib/finance/services.ts · transactions": {
    n: 2,
    porque: "compensação da criação + excluirTransacaoSimples (desfazer da IA) — protegido, decisão (b)",
  },
  "lib/finance/split-reapply.ts · receivables": {
    n: 1,
    porque: "reapplySplit — protegido (regra cheia, A4)",
  },
  "lib/finance/split-reapply.ts · shared_expenses": {
    n: 1,
    porque: "reapplySplit — protegido (regra cheia, A4)",
  },
};

/**
 * Os arquivos com delete protegido chamam a proteção única tantas vezes quantos pontos protegem —
 * tirar a chamada de um ponto derruba este número.
 */
const CHAMADAS_DA_PROTECAO: Record<string, number> = {
  "lib/actions/imports.ts": 1,
  "lib/actions/installments.ts": 2,
  "lib/actions/transactions.ts": 2,
  "lib/finance/services.ts": 1,
  "lib/finance/split-reapply.ts": 1,
};

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

const VARRIDOS = arquivosDeProducao(SRC).map((arquivo) => ({
  caminho: path.relative(SRC, arquivo).split(path.sep).join("/"),
  codigo: semComentarios(fs.readFileSync(arquivo, "utf8")),
}));

const CONTAGEM: Record<string, number> = {};
for (const { caminho, codigo } of VARRIDOS) {
  for (const m of codigo.matchAll(DELETE)) {
    const chave = `${caminho} · ${m[1]}`;
    CONTAGEM[chave] = (CONTAGEM[chave] ?? 0) + 1;
  }
}

describe("03-D · RR-D-17 — quem apaga na cadeia do recebimento", () => {
  it("a varredura alcança o código de produção — não afirma [] === []", () => {
    expect(VARRIDOS.length).toBeGreaterThan(700);
    const caminhos = new Set(VARRIDOS.map((v) => v.caminho));
    for (const chave of Object.keys(ALLOWLIST)) {
      const arquivo = chave.split(" · ")[0];
      expect(caminhos.has(arquivo), arquivo).toBe(true);
    }
  });

  it("todo delete na cadeia do recebimento está na allowlist, com a contagem exata", () => {
    expect(CONTAGEM).toEqual(Object.fromEntries(Object.entries(ALLOWLIST).map(([k, v]) => [k, v.n])));
  });

  it("os pontos protegidos chamam protecaoDosRecebiveis — um por ponto", () => {
    for (const [arquivo, esperado] of Object.entries(CHAMADAS_DA_PROTECAO)) {
      const codigo = VARRIDOS.find((v) => v.caminho === arquivo)?.codigo ?? "";
      const n = (codigo.match(/protecaoDosRecebiveis\(/g) ?? []).length;
      expect(n, arquivo).toBe(esperado);
    }
  });
});
