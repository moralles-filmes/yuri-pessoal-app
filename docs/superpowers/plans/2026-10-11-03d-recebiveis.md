# REDESIGN-03-D — Recebimento parcial, `ignorado` visível e os três números — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar ao recebível um histórico de recebimentos (`receivable_receipts`, a M1), derivar saldo/`parcial`/os três números do §13.4, tornar o `ignorado` visível e despesa minha (D11), e proteger todo caminho de exclusão que levaria dinheiro registrado.

**Architecture:** um módulo **puro** (`src/lib/finance/recebimentos.ts`) é a única regra de saldo, estado derivado, legado (K0), parte do terceiro e perdoado; **uma** leitura (`recebimentos-leitura.ts`) e **uma** escrita (`recebimentos-servico.ts`) são os únicos arquivos que mencionam a tabela; o motor (`dashboard.ts`) recebe só o valor já somado (`recebido`), sem data. A Parte A não move número; a Parte B (B1a, B1b, B2, B3, B4) move, com efeito zero no dado de hoje.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS, MCP para migration), TypeScript, Zod, Vitest (`environment: "node"`), Tailwind v4 + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-10-11-03d-recebiveis-design.md` — é o contrato. Quem discordar de algo nele **para e reporta**. Leia-o inteiro antes da Task 1.

## Global Constraints

- Responda e escreva em **pt-BR**. Commits: título em pt-BR **sem acentos** (`feat(redesign): 03-D A1 — ...`), corpo com o que mudou de natureza, o que não mudou, as mutações (com nome do teste) e o que ficou de fora; última linha `Co-Authored-By:` que o ambiente indicar.
- Branch `feat/redesign-03d-recebiveis` (já existe, base `17a93e9`, desenho em `c1d5c5c`). ⛔ **Sem push, sem merge, sem deploy, sem upstream.**
- ⛔ **Uma migration só, a M1**, aplicada **só** depois do "aplique a M1" **literal** do dono, pelo MCP `apply_migration` no projeto `yjvnlbjvippefvzgrxxw`. Nenhuma outra migration, policy ou backfill. Tipos só por `generate_typescript_types`, com o diff lido (invariante 94).
- ⛔ **NÃO edite** `docs/redesign/STATUS.md` nem nenhum `CLAUDE.md`/`AGENTS.md`.
- ⛔ `src/lib/finance/dashboard.test.ts` fica **byte a byte igual** (`git diff --quiet 17a93e9 -- src/lib/finance/dashboard.test.ts`). `src/lib/finance/dashboard-caracterizacao.test.ts` muda **só** C1–C12 do §7 do spec, cada uma no commit indicado. Se precisar mexer em outra linha, **pare**.
- ⛔ Os **parâmetros** de `getFinanceCardData(mes, todayIso, owner?)`, `getInvoicesCardData(todayIso)`, `getReportsData(mesSel)` e `generateForUser(service, userId, now)` não mudam.
- ⛔ `parcial` nunca é gravado. Nada vira `pago`, `ignorado` ou `cobrado` sozinho. A D3 continua: a soma de terceiros usa o **valor** (exceto `ignorado`, K3-a), e o recebimento não reduz minha despesa nem a fatura.
- `receivables.valor` e `receivable_receipts.valor` são `numeric(14,2)` **em reais** (invariante 63). Centavos só por dentro (`reaisParaCentavos`/`centavosParaReais` de `@/lib/format`).
- Datas puras `'yyyy-MM-dd'` comparadas como **texto**. Nenhum `Date.now()`/`new Date()` sem argumento em código novo; `hoje` é sempre injetado (`hojeISO()` só na casca: action, page, handler).
- Fixture **sintética**: o repositório é público — nenhum nome real de pessoa/categoria, valor em R$ ou saldo real.
- Antes de cada commit: `git diff` revisado (nada de chave, token, `.env`, `service_role`).
- Cada task fecha com `npx vitest run` verde nos diretórios tocados (no mínimo `src/lib/finance/ src/lib/validators/ src/lib/actions/`, mais `src/lib/notifications/ src/lib/ai/ src/lib/settings/ src/lib/dashboard/ src/lib/reports/ src/app/ src/test/` quando tocados) e `npx tsc --noEmit` limpo.
- Shell: Git Bash (POSIX), heredoc `<<'EOF'` para mensagens de commit.
- Roteador: cada task substancial passa pelo `ai-router-br:route`, pacote ≤ 5 arquivos. Decisão do dono, desenho e a M1 (Tasks 2–3) ficam no principal. Copie o `summary_line` do roteador literalmente na entrega.

## Review Focus

1. **Valor digitado no padrão BR** ("250,00", "R$ 1.234,56", " 50 ") no diálogo de recebimento — tem de virar 250 / 1234.56 / 50, nunca `NaN` nem "Informe um valor". Teste na Task 6 (`validators/receivable.test.ts`).
2. **Duas abas recebendo o mesmo recebível ao mesmo tempo** — a pré-checagem passa nas duas, o trigger recusa a segunda; a pessoa tem de ver "Passa do saldo… restam R$ X" **no campo**, nunca um erro genérico, e nada pode ser gravado em dobro. Teste na Task 5 (23514 simulado).
3. **Recebível de valor zero** (o CHECK de `receivables` aceita `valor >= 0`) — "Receber" não pode tentar gravar um recebimento de zero (o CHECK `valor > 0` da M1 recusaria); só a coluna vira `pago`. Teste na Task 5.
4. **Dois recebimentos na mesma data** — "Desfazer" tem de remover o criado por último (desempate por `created_at`), nunca os dois nem o errado. Teste na Task 1 (`ultimoRecebimento`) e na Task 5.
5. **Recebimento lançado às 23h em Brasília** (00h UTC do dia seguinte) — a data padrão é a de Brasília (`hojeISO()` no handler) e a recusa de "data no futuro" compara com `hoje` de Brasília. Teste na Task 5 (`hoje` injetado) e a suíte rodando com `TZ=UTC` (Task 15).

---

## Mapa de arquivos

| Arquivo | Task | Papel |
| --- | --- | --- |
| `src/lib/finance/recebimentos.ts` (novo) | 1 | regras puras: K0, saldo, estado, parte do terceiro, perdoado, os números, seções, rótulos |
| `src/lib/finance/recebimentos.test.ts` (novo) | 1 | testes da regra |
| `src/lib/finance/quem-le-os-recebimentos.test.ts` (novo) | 1 | varredura por allowlist de `receivable_receipts` |
| `supabase/migrations/20261011210000_receivable_receipts.sql` (novo) | 2 | a M1 |
| `src/lib/finance/m1-recebimentos.test.ts` (novo) | 2 | teste do arquivo da M1 |
| `src/types/supabase.ts` | 3 | tipos regenerados (só a M1) |
| `src/lib/settings/export-tables.ts` + `.test.ts` | 3 | backup |
| `src/test/supabase-em-memoria.ts` | 4 | `antesDeGravar`, `update().select()`, `not()` |
| `src/lib/finance/leitura-com-teto.ts` (novo) | 4 | `LeituraComTeto` saindo de `queries.ts` |
| `src/types/database.ts` | 4, 8, 9 | `RecebimentoRow`, `RecebimentoDoBanco`, e os recebimentos nos tipos de recebível |
| `src/lib/finance/recebimentos-leitura.ts` (novo) | 4, 7 | a única leitura |
| `src/lib/finance/recebimentos-servico.ts` (novo) + `.test.ts` | 5 | a única escrita |
| `src/lib/validators/receivable.ts` + `receivable.test.ts` (novo) + `round-trip.test.ts` | 6 | schemas |
| `src/lib/actions/receivables.ts` + `receivables.test.ts` (novo) | 6 | cascas |
| `src/lib/finance/receivables-bulk.ts` + `.test.ts` | 6 | origens da K1 |
| `src/lib/finance/protecao-do-recebivel.ts` + `.test.ts` (novos) | 7 | a regra da A4 |
| `src/lib/finance/split.ts`, `split-reapply.ts`, `src/lib/actions/installments.ts`, `imports.ts`, `transactions.ts`, `src/lib/finance/services.ts` | 7 | os cinco pontos |
| `src/lib/actions/transactions.test.ts`, `installments.test.ts` (novo), `imports-desfazer.test.ts` (novo), `src/lib/finance/services.test.ts` | 7 | testes dos cinco pontos |
| `src/lib/finance/queries.ts` | 8, 9 | `lerRecebiveis` junta os recebimentos; `/faturas` e `/parcelamentos` também |
| `src/app/(app)/terceiros/terceiros-client.tsx`, `page.tsx`, `registrar-recebimento-dialog.tsx` (novo), `terceiros-client.test.ts` (novo) | 8 | a tela |
| `src/components/financeiro/badges.tsx`, `src/lib/finance/constants.ts` | 8 | selo do estado, rótulo "Não será cobrado" |
| `src/lib/finance/pipeline.ts`, `dashboard.ts` (só tipos), `notifications/cron.ts`, `pipeline.test.ts`, `ler-financeiro.test.ts` | 9 | o encanamento |
| `src/lib/finance/dashboard.ts`, `dashboard-recebimentos.test.ts` (novo), `dashboard-caracterizacao.test.ts` (C1–C7, C9–C12), `reports/queries.ts`, `dashboard/queries.ts`, `dashboard/types.ts`, cards | 10 | B1a |
| `src/app/(app)/faturas/statements-client.tsx`, `src/app/(app)/parcelamentos/installments-client.tsx` | 11 | B1b |
| `finance-card.tsx`, `invoices-card.tsx`, `financial-dashboard-client.tsx`, `relatorios-client.tsx` | 12 | B2 |
| `terceiros-client.tsx` | 13 | B3 |
| `dashboard.ts`, `cron.ts`, `terceiros-client.tsx`, `ai/tools/registry.ts` + `registry.test.ts`, `dashboard-caracterizacao.test.ts` (C8) | 14 | B4 |

---

### Task 1: A1 — as regras puras e a varredura nascendo vazia

**Files:**
- Create: `src/lib/finance/recebimentos.ts`
- Create: `src/lib/finance/recebimentos.test.ts`
- Create: `src/lib/finance/quem-le-os-recebimentos.test.ts`

**Interfaces:**
- Consumes: `RECEIVABLE_STATUSES` (`@/lib/finance/constants`), `reaisParaCentavos`, `centavosParaReais`, `formatCurrency` (`@/lib/format` — não importa nada).
- Produces (todas as Tasks seguintes dependem destes nomes **exatos**):
  - tipos `RecebimentoLido`, `RecebivelComData`, `RecebivelComRecebimentos`, `EntradaDoRecebivel`, `RecebivelResumido`, `EstadoDoRecebivel`, `SecoesDaLista<T>`;
  - constantes `ESTADOS_DO_RECEBIVEL`, `ESTADOS_EM_ABERTO`, `ESTADO_LABELS`;
  - funções `entradasDoRecebivel`, `resumirRecebivel`, `recebidoCentavos`, `saldoCentavos`, `estadoDoRecebivel`, `emAberto`, `parteDoTerceiroCentavos`, `perdoadoCentavos`, `pendenteDoPeriodo`, `totalPendenteAte`, `reembolsosRecebidosNoPeriodo`, `perdoadoNoPeriodo`, `anexarRecebimentos`, `ultimoRecebimento`, `secoesDaLista`, `rotuloPendenteDoMes`, `rotuloTotalPendenteAte`, `fraseDoPerdoado`.

- [ ] **Step 1: Escreva o teste da regra (vermelho)**

`src/lib/finance/recebimentos.test.ts`:

```ts
/**
 * REDESIGN-03-D · A1 — as regras puras do recebimento parcial. Fixture sintética.
 */
import { describe, expect, it } from "vitest";
import {
  anexarRecebimentos,
  emAberto,
  entradasDoRecebivel,
  estadoDoRecebivel,
  fraseDoPerdoado,
  parteDoTerceiroCentavos,
  pendenteDoPeriodo,
  perdoadoCentavos,
  perdoadoNoPeriodo,
  recebidoCentavos,
  reembolsosRecebidosNoPeriodo,
  resumirRecebivel,
  rotuloPendenteDoMes,
  rotuloTotalPendenteAte,
  saldoCentavos,
  secoesDaLista,
  totalPendenteAte,
  ultimoRecebimento,
  type EstadoDoRecebivel,
  type RecebivelComRecebimentos,
} from "@/lib/finance/recebimentos";

const rec = (
  sobre: Partial<RecebivelComRecebimentos> = {},
): RecebivelComRecebimentos & { ref_month?: string | null } => ({
  valor: 600,
  status: "pendente",
  pago_em: null,
  recebimentos: [],
  ...sobre,
});

describe("K0 — entradasDoRecebivel é o único lugar que conhece o legado", () => {
  it("pago SEM recebimento conta como UMA entrada do valor inteiro em pago_em", () => {
    expect(entradasDoRecebivel(rec({ status: "pago", pago_em: "2026-06-10" }), [])).toEqual([
      { centavos: 60000, data: "2026-06-10", origem: "legado" },
    ]);
  });

  it("pago COM recebimento conta SÓ pelos recebimentos — nunca pelos dois caminhos", () => {
    const r = rec({ status: "pago", pago_em: "2026-06-20" });
    const entradas = entradasDoRecebivel(r, [
      { valor: 250, recebido_em: "2026-06-05" },
      { valor: 350, recebido_em: "2026-06-20" },
    ]);
    expect(entradas).toEqual([
      { centavos: 25000, data: "2026-06-05", origem: "recebimento" },
      { centavos: 35000, data: "2026-06-20", origem: "recebimento" },
    ]);
    expect(entradas.some((e) => e.origem === "legado")).toBe(false);
  });

  it("pendente sem recebimento não tem entrada", () => {
    expect(entradasDoRecebivel(rec(), [])).toEqual([]);
  });

  it("legado sem pago_em zera o saldo mas não tem data", () => {
    expect(entradasDoRecebivel(rec({ status: "pago", pago_em: null }), [])).toEqual([
      { centavos: 60000, data: null, origem: "legado" },
    ]);
  });
});

describe("saldo e recebido", () => {
  it("600 − 250 = 350", () => {
    const r = resumirRecebivel(rec({ recebimentos: [{ valor: 250, recebido_em: "2026-06-05" }] }));
    expect(r.recebido).toBe(250);
    expect(saldoCentavos(r)).toBe(35000);
  });

  it("recebido AUSENTE com status pago é legado: saldo zero (K0 sobre lista vazia)", () => {
    expect(recebidoCentavos({ valor: 30.3, status: "pago" })).toBe(3030);
    expect(saldoCentavos({ valor: 30.3, status: "pago" })).toBe(0);
  });

  it("recebido AUSENTE com status pendente: saldo é o valor", () => {
    expect(saldoCentavos({ valor: 600, status: "pendente" })).toBe(60000);
  });

  it("não trunca em zero (a caracterização tem fixture negativa)", () => {
    expect(saldoCentavos({ valor: -10, status: "pendente" })).toBe(-1000);
  });
});

describe("estadoDoRecebivel — a soma manda (K1)", () => {
  const casos: Array<[string, Parameters<typeof estadoDoRecebivel>[0], EstadoDoRecebivel]> = [
    ["status fora da lista", { valor: 100, status: "parcial" }, "desconhecido"],
    ["ignorado", { valor: 100, status: "ignorado", recebido: 40 }, "ignorado"],
    ["soma fechada com coluna pendente", { valor: 100, status: "pendente", recebido: 100 }, "pago"],
    ["legado pago", { valor: 100, status: "pago" }, "pago"],
    ["pago de valor zero", { valor: 0, status: "pago" }, "pago"],
    ["coluna pago com recebimento parcial", { valor: 100, status: "pago", recebido: 40 }, "parcial"],
    ["pendente com recebimento parcial", { valor: 100, status: "pendente", recebido: 40 }, "parcial"],
    ["cobrado sem recebimento", { valor: 100, status: "cobrado" }, "cobrado"],
    ["pendente sem recebimento", { valor: 100, status: "pendente" }, "pendente"],
    ["coluna pago sem NADA recebido até o corte", { valor: 100, status: "pago", recebido: 0 }, "pendente"],
    ["valor zero pendente", { valor: 0, status: "pendente" }, "pendente"],
  ];
  it.each(casos)("%s", (_nome, r, esperado) => {
    expect(estadoDoRecebivel(r)).toBe(esperado);
  });

  it("em aberto = pendente, parcial ou cobrado", () => {
    expect(emAberto({ valor: 100, status: "pendente", recebido: 40 })).toBe(true);
    expect(emAberto({ valor: 100, status: "cobrado" })).toBe(true);
    expect(emAberto({ valor: 100, status: "pago" })).toBe(false);
    expect(emAberto({ valor: 100, status: "ignorado" })).toBe(false);
    expect(emAberto({ valor: 100, status: "inventado" })).toBe(false);
  });
});

describe("D3 e K3-a — parte do terceiro e perdoado", () => {
  it.each(["pendente", "cobrado", "pago", "inventado"])(
    "%s com recebimento parcial: a parte do terceiro é o VALOR, nunca o saldo (D3)",
    (status) => {
      expect(parteDoTerceiroCentavos({ valor: 600, status, recebido: 250 })).toBe(60000);
    },
  );

  it("ignorado: a parte do terceiro é o que ele chegou a pagar (K3-a)", () => {
    expect(parteDoTerceiroCentavos({ valor: 600, status: "ignorado", recebido: 250 })).toBe(25000);
    expect(parteDoTerceiroCentavos({ valor: 600, status: "ignorado" })).toBe(0);
  });

  it("perdoado = saldo do ignorado; 0 nos outros", () => {
    expect(perdoadoCentavos({ valor: 600, status: "ignorado", recebido: 250 })).toBe(35000);
    expect(perdoadoCentavos({ valor: 600, status: "ignorado" })).toBe(60000);
    expect(perdoadoCentavos({ valor: 600, status: "pendente", recebido: 250 })).toBe(0);
  });

  it("parte do terceiro + perdoado = valor, sempre", () => {
    for (const status of ["pendente", "cobrado", "pago", "ignorado"]) {
      const r = { valor: 600, status, recebido: 250 };
      expect(parteDoTerceiroCentavos(r) + perdoadoCentavos(r)).toBe(60000);
    }
  });
});

describe("os três números do §13.4 + Perdoado", () => {
  it("pendente do período: saldo dos em aberto do mês, por ref_month", () => {
    const recs = [
      { valor: 600, status: "pendente", recebido: 250, ref_month: "2026-06" },
      { valor: 100, status: "cobrado", ref_month: "2026-06" },
      { valor: 999, status: "pago", ref_month: "2026-06" },
      { valor: 999, status: "ignorado", ref_month: "2026-06" },
      { valor: 70, status: "pendente", ref_month: "2026-07" },
    ];
    expect(pendenteDoPeriodo(recs, "2026-06")).toBe(450);
    expect(pendenteDoPeriodo(recs)).toBe(520);
  });

  it("reembolsos recebidos: pela DATA do recebimento, nunca por ref_month", () => {
    const itens = [
      { ...rec({ recebimentos: [{ valor: 250, recebido_em: "2026-06-05" }, { valor: 350, recebido_em: "2026-07-20" }] }), ref_month: "2026-05" },
      { ...rec({ valor: 100, status: "pago", pago_em: "2026-06-10" }), ref_month: "2026-01" },
    ];
    expect(reembolsosRecebidosNoPeriodo(itens, { de: "2026-06-01", ate: "2026-06-31" })).toBe(350);
    expect(reembolsosRecebidosNoPeriodo(itens, { de: "2026-07-01", ate: "2026-07-31" })).toBe(350);
    expect(reembolsosRecebidosNoPeriodo(itens, { de: "2026-05-01", ate: "2026-05-31" })).toBe(0);
  });

  it("total pendente até o corte: recebimento DEPOIS do corte não reduz o saldo", () => {
    const itens = [
      rec({ recebimentos: [{ valor: 250, recebido_em: "2026-06-05" }, { valor: 350, recebido_em: "2026-07-20" }] }),
    ];
    expect(totalPendenteAte(itens, "2026-06-30")).toBe(350);
    expect(totalPendenteAte(itens, "2026-07-20")).toBe(0);
    expect(totalPendenteAte(itens, "2026-06-01")).toBe(600);
  });

  it("legado pago DEPOIS do corte conta como pendente no corte", () => {
    const itens = [rec({ valor: 100, status: "pago", pago_em: "2026-06-10" })];
    expect(totalPendenteAte(itens, "2026-06-09")).toBe(100);
    expect(totalPendenteAte(itens, "2026-06-10")).toBe(0);
  });

  it("com o corte = hoje e nenhuma data no futuro, é igual ao pendente sem mês (equivalência)", () => {
    const itens = [
      rec({ recebimentos: [{ valor: 250, recebido_em: "2026-06-05" }] }),
      rec({ valor: 100, status: "cobrado" }),
      rec({ valor: 80, status: "pago", pago_em: "2026-06-01" }),
      rec({ valor: 40, status: "ignorado" }),
    ];
    expect(totalPendenteAte(itens, "2026-06-30")).toBe(pendenteDoPeriodo(itens.map(resumirRecebivel)));
  });

  it("perdoado no período: saldo dos ignorados do mês", () => {
    const recs = [
      { valor: 600, status: "ignorado", recebido: 250, ref_month: "2026-06" },
      { valor: 100, status: "ignorado", ref_month: "2026-07" },
      { valor: 999, status: "pendente", ref_month: "2026-06" },
    ];
    expect(perdoadoNoPeriodo(recs, "2026-06")).toBe(350);
  });
});

describe("apoios", () => {
  it("anexarRecebimentos junta por receivable_id e dá [] a quem não tem", () => {
    const juntos = anexarRecebimentos(
      [{ id: "a" }, { id: "b" }],
      [{ receivable_id: "a", valor: 1, recebido_em: "2026-06-01" }],
    );
    expect(juntos.map((r) => r.recebimentos.length)).toEqual([1, 0]);
  });

  it("ultimoRecebimento: data mais recente; empate desempata por created_at", () => {
    const x = [
      { id: "r1", recebido_em: "2026-06-20", created_at: "2026-06-20T10:00:00Z" },
      { id: "r2", recebido_em: "2026-06-20", created_at: "2026-06-20T11:00:00Z" },
      { id: "r3", recebido_em: "2026-06-05", created_at: "2026-06-30T09:00:00Z" },
    ];
    expect(ultimoRecebimento(x)?.id).toBe("r2");
    expect(ultimoRecebimento([])).toBeNull();
  });

  it("secoesDaLista: ignorado vai para 'Não será cobrado' e NENHUM item some", () => {
    const estados: EstadoDoRecebivel[] = ["pendente", "ignorado", "pago", "parcial", "cobrado", "desconhecido"];
    const s = secoesDaLista(estados, (e) => e);
    expect(s.emAberto).toEqual(["pendente", "parcial", "cobrado"]);
    expect(s.naoSeraCobrado).toEqual(["ignorado"]);
    expect(s.historico).toEqual(["pago", "desconhecido"]);
    expect(s.emAberto.length + s.naoSeraCobrado.length + s.historico.length).toBe(estados.length);
  });

  it("rótulos", () => {
    expect(rotuloPendenteDoMes("2026-06")).toBe("Pendente referente a junho de 2026");
    expect(rotuloTotalPendenteAte("2026-10-11")).toBe("Total pendente até 11/10");
  });

  it("frase do perdoado só existe quando há perdoado", () => {
    expect(fraseDoPerdoado(0)).toBeNull();
    expect(fraseDoPerdoado(-1)).toBeNull();
    expect(fraseDoPerdoado(600)).toContain("600,00");
    expect(fraseDoPerdoado(600)).toContain("que você decidiu não cobrar");
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `npx vitest run src/lib/finance/recebimentos.test.ts`
Expected: FAIL — `Cannot find module '@/lib/finance/recebimentos'` (ou equivalente).

- [ ] **Step 3: Implemente o módulo puro**

`src/lib/finance/recebimentos.ts`:

```ts
/**
 * REDESIGN-03-D · A1 — AS REGRAS PURAS DO RECEBIMENTO PARCIAL (E1, D6, D11; §13.4 do dicionário).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O que foi DEVIDO (`receivables.valor`, a responsabilidade original) é um fato; o que   ║
 * ║ já VOLTOU (`receivable_receipts`) é outro. Tudo o que se deriva dos dois mora aqui:    ║
 * ║ saldo, estado (`parcial` NUNCA é gravado), o legado (K0), a parte do terceiro, o       ║
 * ║ perdoado (D11) e os três números do §13.4.                                              ║
 * ║                                                                                       ║
 * ║ ⛔ D3: a parte do terceiro é o VALOR, nunca o saldo. A única exceção é o `ignorado`    ║
 * ║    (K3-a): perdoado o resto, o que ele chegou a pagar continua sendo dele.            ║
 * ║ ⛔ Este arquivo NÃO menciona a tabela de recebimentos: recebe valores, não linhas.     ║
 * ║    Puro: sem I/O, sem `zod`, sem `Date.now()`. A tela, o motor e o servidor o usam.   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `valor` está em REAIS (`numeric(14,2)`, invariante 63); centavos só por dentro.
 */
import { RECEIVABLE_STATUSES } from "@/lib/finance/constants";
import { centavosParaReais, formatCurrency, reaisParaCentavos } from "@/lib/format";

const cent = (v: number | string): number => reaisParaCentavos(Number(v));

/** Uma linha de recebimento, como chega da leitura. */
export type RecebimentoLido = { readonly valor: number | string; readonly recebido_em: string };

/** O recebível com o que a K0 precisa. `pago_em` só importa para DATAR o legado. */
export type RecebivelComData = {
  readonly valor: number | string;
  readonly status: string;
  readonly pago_em?: string | null;
};

export type RecebivelComRecebimentos = RecebivelComData & {
  readonly recebimentos: readonly RecebimentoLido[];
};

/** K0 — o que conta como "já voltou". */
export type EntradaDoRecebivel = {
  readonly centavos: number;
  /** 'yyyy-MM-dd'; `null` só no legado sem `pago_em`. */
  readonly data: string | null;
  readonly origem: "recebimento" | "legado";
};

/** O recebível com o recebido JÁ SOMADO — a forma que o motor recebe (P2). */
export type RecebivelResumido = {
  readonly valor: number | string;
  readonly status: string;
  /** Em reais. Ausente = nenhum recebimento informado → K0 sobre lista vazia. */
  readonly recebido?: number;
};

export const ESTADOS_DO_RECEBIVEL = [
  "pendente",
  "parcial",
  "cobrado",
  "pago",
  "ignorado",
  "desconhecido",
] as const;
export type EstadoDoRecebivel = (typeof ESTADOS_DO_RECEBIVEL)[number];

/** O que ainda se deve: entra em "a receber" e pode ser cobrado, recebido ou ignorado. */
export const ESTADOS_EM_ABERTO: readonly EstadoDoRecebivel[] = ["pendente", "parcial", "cobrado"];

export const ESTADO_LABELS: Record<EstadoDoRecebivel, string> = {
  pendente: "Pendente",
  parcial: "Parcial",
  cobrado: "Cobrado",
  pago: "Recebido",
  ignorado: "Não será cobrado",
  desconhecido: "Status desconhecido",
};

const somar = (entradas: readonly EntradaDoRecebivel[]): number =>
  entradas.reduce((s, e) => s + e.centavos, 0);

/**
 * K0 — O ÚNICO LUGAR QUE CONHECE O LEGADO. Com ao menos um recebimento, só eles contam. Sem
 * nenhum e com a coluna em `pago`, o valor inteiro conta como recebido em `pago_em` (os
 * recebíveis pagos antes da M1 não têm linha de recebimento, e não ganham uma: sem backfill).
 */
export function entradasDoRecebivel(
  r: RecebivelComData,
  recebimentos: readonly RecebimentoLido[],
): EntradaDoRecebivel[] {
  if (recebimentos.length > 0) {
    return recebimentos.map((x) => ({
      centavos: cent(x.valor),
      data: x.recebido_em,
      origem: "recebimento" as const,
    }));
  }
  if (r.status === "pago") {
    return [{ centavos: cent(r.valor), data: r.pago_em ?? null, origem: "legado" }];
  }
  return [];
}

/** Recebível com a lista de recebimentos → a forma resumida, com o recebido somado (K0). */
export function resumirRecebivel(
  r: RecebivelComRecebimentos,
): RecebivelResumido & { readonly recebido: number } {
  return {
    valor: r.valor,
    status: r.status,
    recebido: centavosParaReais(somar(entradasDoRecebivel(r, r.recebimentos))),
  };
}

export function recebidoCentavos(r: RecebivelResumido): number {
  return r.recebido !== undefined
    ? reaisParaCentavos(r.recebido)
    : somar(entradasDoRecebivel(r, []));
}

/** `valor − recebido`, SEM truncar em zero. */
export function saldoCentavos(r: RecebivelResumido): number {
  return cent(r.valor) - recebidoCentavos(r);
}

function estadoPorCentavos(status: string, valorCent: number, recebidoCent: number): EstadoDoRecebivel {
  if (!(RECEIVABLE_STATUSES as readonly string[]).includes(status)) return "desconhecido";
  if (status === "ignorado") return "ignorado";
  const saldo = valorCent - recebidoCent;
  if (saldo <= 0 && (recebidoCent > 0 || status === "pago")) return "pago";
  if (recebidoCent > 0) return "parcial";
  if (status === "cobrado") return "cobrado";
  return "pendente";
}

/**
 * O estado DERIVADO, avaliado em ordem: desconhecido → ignorado (decisão) → pago (a soma
 * fechou) → parcial → cobrado (decisão) → pendente. A coluna `pago` sem NADA recebido cai em
 * `pendente` — inalcançável pelo app (o legado tem recebido = valor), e é o que faz o corte
 * por data tratar um legado pago DEPOIS do corte como pendente no corte.
 */
export function estadoDoRecebivel(r: RecebivelResumido): EstadoDoRecebivel {
  return estadoPorCentavos(r.status, cent(r.valor), recebidoCentavos(r));
}

export function emAberto(r: RecebivelResumido): boolean {
  return ESTADOS_EM_ABERTO.includes(estadoDoRecebivel(r));
}

/** ⛔ D3: o VALOR, nunca o saldo. Exceção declarada: `ignorado` → o que ele pagou (K3-a). */
export function parteDoTerceiroCentavos(r: RecebivelResumido): number {
  return estadoDoRecebivel(r) === "ignorado" ? recebidoCentavos(r) : cent(r.valor);
}

/** D11: o que eu decidi não cobrar vira despesa minha — o saldo do `ignorado`. */
export function perdoadoCentavos(r: RecebivelResumido): number {
  return estadoDoRecebivel(r) === "ignorado" ? cent(r.valor) - recebidoCentavos(r) : 0;
}

type ComMes = { readonly ref_month?: string | null };

/** "Pendente referente a {mês}" — e, sem mês, o total em aberto. É o que `totalAReceber` chama no B4. */
export function pendenteDoPeriodo(recs: readonly (RecebivelResumido & ComMes)[], mes?: string): number {
  let total = 0;
  for (const r of recs) {
    if (mes && r.ref_month !== mes) continue;
    if (!emAberto(r)) continue;
    total += saldoCentavos(r);
  }
  return centavosParaReais(total);
}

/** "Total pendente até DD/MM": só conta o que voltou até o corte (inclusive). */
export function totalPendenteAte(itens: readonly RecebivelComRecebimentos[], corte: string): number {
  let total = 0;
  for (const r of itens) {
    const recebido = somar(
      entradasDoRecebivel(r, r.recebimentos).filter((e) => e.data === null || e.data <= corte),
    );
    const valorCent = cent(r.valor);
    if (!ESTADOS_EM_ABERTO.includes(estadoPorCentavos(r.status, valorCent, recebido))) continue;
    total += valorCent - recebido;
  }
  return centavosParaReais(total);
}

/** "Reembolsos recebidos neste período": pela DATA do recebimento (ou do legado). Nunca `ref_month`. */
export function reembolsosRecebidosNoPeriodo(
  itens: readonly RecebivelComRecebimentos[],
  periodo: { readonly de: string; readonly ate: string },
): number {
  let total = 0;
  for (const r of itens) {
    for (const e of entradasDoRecebivel(r, r.recebimentos)) {
      if (e.data === null || e.data < periodo.de || e.data > periodo.ate) continue;
      total += e.centavos;
    }
  }
  return centavosParaReais(total);
}

/** "Perdoado (não será cobrado)" do mês. */
export function perdoadoNoPeriodo(recs: readonly (RecebivelResumido & ComMes)[], mes: string): number {
  let total = 0;
  for (const r of recs) if (r.ref_month === mes) total += perdoadoCentavos(r);
  return centavosParaReais(total);
}

/** Junção pura por `receivable_id`, na ordem de entrada. */
export function anexarRecebimentos<
  R extends { readonly id: string },
  X extends { readonly receivable_id: string },
>(recebiveis: readonly R[], recebimentos: readonly X[]): (R & { recebimentos: X[] })[] {
  const por = new Map<string, X[]>();
  for (const x of recebimentos) {
    const lista = por.get(x.receivable_id) ?? [];
    lista.push(x);
    por.set(x.receivable_id, lista);
  }
  return recebiveis.map((r) => ({ ...r, recebimentos: por.get(r.id) ?? [] }));
}

/** P6 — o último: `recebido_em` desc, depois `created_at` desc. */
export function ultimoRecebimento<
  X extends { readonly recebido_em: string; readonly created_at?: string | null },
>(recebimentos: readonly X[]): X | null {
  let ultimo: X | null = null;
  for (const x of recebimentos) {
    if (
      ultimo === null ||
      x.recebido_em > ultimo.recebido_em ||
      (x.recebido_em === ultimo.recebido_em && (x.created_at ?? "") > (ultimo.created_at ?? ""))
    ) {
      ultimo = x;
    }
  }
  return ultimo;
}

export type SecoesDaLista<T> = { emAberto: T[]; naoSeraCobrado: T[]; historico: T[] };

/** P7/D11 — "Não será cobrado" é seção própria: o perdoado não some da lista. */
export function secoesDaLista<T>(
  itens: readonly T[],
  estadoDe: (item: T) => EstadoDoRecebivel,
): SecoesDaLista<T> {
  const secoes: SecoesDaLista<T> = { emAberto: [], naoSeraCobrado: [], historico: [] };
  for (const item of itens) {
    const estado = estadoDe(item);
    if (ESTADOS_EM_ABERTO.includes(estado)) secoes.emAberto.push(item);
    else if (estado === "ignorado") secoes.naoSeraCobrado.push(item);
    else secoes.historico.push(item);
  }
  return secoes;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** 'yyyy-MM' → "Pendente referente a junho de 2026" (tabela estática: determinístico). */
export function rotuloPendenteDoMes(mes: string): string {
  const [ano, m] = mes.split("-");
  return `Pendente referente a ${MESES[Number(m) - 1]} de ${ano}`;
}

/** 'yyyy-MM-dd' (data PURA, recortada como texto) → "Total pendente até DD/MM". */
export function rotuloTotalPendenteAte(dataIso: string): string {
  return `Total pendente até ${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}`;
}

/** A linha da D11 — só existe quando há perdoado. */
export function fraseDoPerdoado(perdoado: number): string | null {
  return perdoado > 0 ? `inclui ${formatCurrency(perdoado)} que você decidiu não cobrar` : null;
}
```

- [ ] **Step 4: Rode e veja passar**

Run: `npx vitest run src/lib/finance/recebimentos.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Escreva a varredura nascendo vazia**

`src/lib/finance/quem-le-os-recebimentos.test.ts`:

```ts
/**
 * REDESIGN-03-D · A1 — quem menciona `receivable_receipts` no código de produção.
 *
 * ⛔ Uma leitura e uma escrita (spec §5.1, P3). O conjunto de arquivos que mencionam a tabela
 * tem de ser EXATAMENTE a allowlist abaixo — allowlist, não lista de proibidos. Nasce VAZIA
 * (2026-10-11) e cada passo acrescenta o seu arquivo, com o motivo.
 *
 * ⚠️ Varredura TEXTUAL (RR-D-1). A prova comportamental da D3 é o Y9 e `parteDoTerceiroCentavos`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "..");
const TABELA = "receivable_receipts";

/** Caminho relativo a `src/` → por que este arquivo pode mencionar a tabela. */
const ALLOWLIST: Record<string, string> = {};

/** Os que NUNCA podem mencionar — nem entrar na allowlist. */
const NUNCA = [
  "lib/finance/dashboard.ts",
  "lib/finance/pipeline.ts",
  "lib/finance/recebimentos.ts",
  "lib/finance/split.ts",
  "lib/finance/split-persist.ts",
  "lib/finance/split-reapply.ts",
  "lib/finance/services.ts",
  "lib/finance/queries.ts",
  "lib/actions/receivables.ts",
  "lib/actions/transactions.ts",
  "lib/actions/installments.ts",
  "lib/actions/imports.ts",
  "lib/reports/queries.ts",
  "lib/dashboard/queries.ts",
  "lib/ai/tools/adapters/finance.ts",
  "lib/ai/tools/registry.ts",
  "lib/ai/insights/collectors/finance.ts",
  "lib/notifications/generate.ts",
  "lib/notifications/cron.ts",
] as const;

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

const QUE_MENCIONAM = VARRIDOS.filter((v) => v.codigo.includes(TABELA))
  .map((v) => v.caminho)
  .sort();

describe("03-D · A1 — quem menciona a tabela de recebimentos", () => {
  it("a varredura alcança o código de produção — não afirma [] === []", () => {
    expect(VARRIDOS.length).toBeGreaterThan(700);
    const caminhos = new Set(VARRIDOS.map((v) => v.caminho));
    for (const arquivo of NUNCA) expect(caminhos.has(arquivo), arquivo).toBe(true);
  });

  it("só os arquivos da allowlist mencionam receivable_receipts", () => {
    expect(QUE_MENCIONAM).toEqual(Object.keys(ALLOWLIST).sort());
  });

  it("a allowlist não tem entrada morta, e toda entrada diz por quê", () => {
    for (const [arquivo, motivo] of Object.entries(ALLOWLIST)) {
      expect(QUE_MENCIONAM, arquivo).toContain(arquivo);
      expect(motivo.trim().length, arquivo).toBeGreaterThan(10);
    }
  });

  it.each(NUNCA)("%s não menciona a tabela e não está na allowlist", (arquivo) => {
    expect(Object.keys(ALLOWLIST)).not.toContain(arquivo);
    expect(QUE_MENCIONAM).not.toContain(arquivo);
  });
});
```

⚠️ `lib/finance/recebimentos.ts` precisa existir para o primeiro caso (`caminhos.has`) — ele foi criado no Step 3.

- [ ] **Step 6: Rode e confirme o vazio, e veja a varredura vermelha uma vez**

Run: `npx vitest run src/lib/finance/quem-le-os-recebimentos.test.ts`
Expected: PASS. Depois, acrescente temporariamente `const _t = "receivable_receipts";` em `src/lib/finance/dashboard.ts`, rode de novo — Expected: FAIL em *"só os arquivos da allowlist…"* e em *"lib/finance/dashboard.ts não menciona…"* — e **desfaça** (`git checkout -- src/lib/finance/dashboard.ts`; confira `git diff --quiet -- src/lib/finance/dashboard.ts`).

- [ ] **Step 7: Rode a pasta e o tsc, revise o diff e faça o commit**

Run: `npx vitest run src/lib/finance/ && npx tsc --noEmit`
Expected: verde; `dashboard.test.ts` e `dashboard-caracterizacao.test.ts` sem diff.

```bash
git add src/lib/finance/recebimentos.ts src/lib/finance/recebimentos.test.ts src/lib/finance/quem-le-os-recebimentos.test.ts
git commit -F - <<'EOF'
feat(redesign): 03-D A1 — regras puras do recebimento parcial e a varredura nascendo vazia

O que muda de natureza: saldo, estado derivado (parcial nunca gravado), o legado
(K0), a parte do terceiro (D3; ignorado → o recebido, K3-a), o perdoado (D11) e os
tres numeros do §13.4 passam a ter UMA regra, pura. Nenhum leitor ainda.
O que nao muda: nenhum numero de tela; dashboard.test.ts e a caracterizacao intactos.
A varredura de receivable_receipts nasce com a allowlist vazia.

Co-Authored-By: <a linha que o seu ambiente indicar>
EOF
```

---

### Task 2: A2 (parte 1) — o arquivo da M1, o teste, o validador e o PEDIDO

**Files:**
- Create: `supabase/migrations/20261011210000_receivable_receipts.sql`
- Create: `src/lib/finance/m1-recebimentos.test.ts`

**Interfaces:**
- Produces: a tabela `public.receivable_receipts` (colunas `id, user_id, receivable_id, valor, recebido_em, conta_id, transaction_id, observacoes, created_at, updated_at`), a constraint `receivables_id_user_uk`, a FK `receivable_receipts_owner_fk`, a função/trigger `receivable_receipts_nao_excede` (erro `check_violation` = `23514`).

- [ ] **Step 1: Escreva o teste do arquivo (vermelho)**

`src/lib/finance/m1-recebimentos.test.ts`:

```ts
/**
 * REDESIGN-03-D · A2 — o arquivo da M1, conferido no repositório (padrão de
 * `m3-categorias.test.ts`: achado por CONTEÚDO, SQL sem comentários).
 *
 * A M1 é aditiva: uma tabela nova e um `unique` em `receivables`. O que este teste trava é o que
 * a tornaria outra coisa: RLS sem FORCE, FK sem o dono, trigger sem lock, e qualquer escrita de
 * dado — a M1 NÃO faz backfill (K0).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(__dirname, "..", "..", "..", "supabase", "migrations");

function semComentarios(sql: string): string {
  return sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
}

const ARQUIVOS = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const ler = (f: string) => semComentarios(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
const DA_M1 = ARQUIVOS.filter((f) => ler(f).includes("create table if not exists public.receivable_receipts"));
const SQL = (DA_M1.length === 1 ? ler(DA_M1[0]) : "").toLowerCase().replace(/\s+/g, " ");

describe("03-D · A2 — a M1 (receivable_receipts)", () => {
  it("existe exatamente um arquivo que cria a tabela", () => {
    expect(DA_M1).toHaveLength(1);
  });

  it("receivables ganha unique (id, user_id), recriado de forma idempotente", () => {
    const drop = SQL.indexOf("drop constraint if exists receivables_id_user_uk");
    const add = SQL.indexOf("add constraint receivables_id_user_uk unique (id, user_id)");
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
  });

  it("a FK do recebível é COMPOSTA com o dono e cascade (invariante 23)", () => {
    expect(SQL).toContain(
      "foreign key (receivable_id, user_id) references public.receivables (id, user_id) on delete cascade",
    );
    expect(SQL).not.toMatch(/receivable_id uuid[^,]*references/);
  });

  it("RLS E FORCE RLS", () => {
    expect(SQL).toContain("alter table public.receivable_receipts enable row level security");
    expect(SQL).toContain("alter table public.receivable_receipts force row level security");
  });

  it("a policy usa (select auth.uid()) no using e no with check", () => {
    expect(SQL).toContain("using (user_id = (select auth.uid()))");
    expect(SQL).toContain("with check (user_id = (select auth.uid()))");
  });

  it("valor > 0 em reais e recebido_em é data pura", () => {
    expect(SQL).toContain("valor numeric(14,2) not null check (valor > 0)");
    expect(SQL).toContain("recebido_em date not null");
  });

  it("o trigger trava o excesso com FOR UPDATE, security invoker e search_path vazio", () => {
    expect(SQL).toContain("create or replace function public.receivable_receipts_nao_excede()");
    expect(SQL).toContain("security invoker");
    expect(SQL).toContain("set search_path = ''");
    expect(SQL).toMatch(/where r\.id = new\.receivable_id for update;/);
    expect(SQL).toContain("if v_recebido + new.valor > v_devido then");
    expect(SQL).toContain("errcode = 'check_violation'");
    expect(SQL).toContain(
      "before insert or update on public.receivable_receipts for each row execute function public.receivable_receipts_nao_excede()",
    );
  });

  it("o arquivo NÃO escreve dado — sem backfill (K0)", () => {
    expect(SQL).not.toMatch(/\binsert\s+into\b/);
    expect(SQL).not.toMatch(/\bupdate\s+public\./);
    expect(SQL).not.toMatch(/\bdelete\s+from\b/);
    expect(SQL).not.toMatch(/\btruncate\b/);
    expect(SQL).not.toMatch(/\bdrop\s+(column|table)\b/);
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `npx vitest run src/lib/finance/m1-recebimentos.test.ts`
Expected: FAIL em *"existe exatamente um arquivo que cria a tabela"* (0 arquivos).

- [ ] **Step 3: Escreva o arquivo da M1 — o SQL de `docs/redesign/MIGRATIONS.md` §M1 byte a byte no corpo**

`supabase/migrations/20261011210000_receivable_receipts.sql`:

```sql
-- supabase/migrations/20261011210000_receivable_receipts.sql
-- REDESIGN-03-D (M1). D6: recebimento parcial de recebível. `receivables.valor` passa a ser a
-- RESPONSABILIDADE ORIGINAL; o saldo é `valor - soma dos recebimentos`.
-- K0: SEM backfill — os recebíveis pagos antes desta migration são lidos como legado no código.
-- K2: `conta_id` e `transaction_id` ficam sem uso nesta subfase (o vínculo com o lançamento é da
--     04-C, que os tornará FK compostas). O SQL abaixo é o aprovado, sem mudança.

-- (1) Habilita a FK COMPOSTA (invariante 23 da 17-F): a RLS confere o user_id da
--     PRÓPRIA linha e não alcança a linha apontada.
alter table public.receivables
  drop constraint if exists receivables_id_user_uk;
alter table public.receivables
  add constraint receivables_id_user_uk unique (id, user_id);

create table if not exists public.receivable_receipts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  receivable_id  uuid not null,
  valor          numeric(14,2) not null check (valor > 0),
  -- Data pura: é o dia em que o dinheiro entrou, não um instante.
  recebido_em    date not null,
  -- Opcionais: a conta que recebeu e o lançamento de caixa correspondente (E4).
  conta_id       uuid references public.accounts(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  observacoes    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.receivable_receipts
  drop constraint if exists receivable_receipts_owner_fk;
alter table public.receivable_receipts
  add constraint receivable_receipts_owner_fk
  foreign key (receivable_id, user_id)
  references public.receivables (id, user_id)
  on delete cascade;

comment on constraint receivable_receipts_owner_fk on public.receivable_receipts is
  'FK COMPOSTA: o recebimento só aponta para recebível DO MESMO usuário. A RLS confere a própria linha e não alcança a linha apontada.';

create index if not exists receivable_receipts_user_idx
  on public.receivable_receipts (user_id);
create index if not exists receivable_receipts_receivable_idx
  on public.receivable_receipts (receivable_id);
-- A visão de caixa filtra por data; o índice existe para ela.
create index if not exists receivable_receipts_user_data_idx
  on public.receivable_receipts (user_id, recebido_em);

alter table public.receivable_receipts enable row level security;
alter table public.receivable_receipts force row level security;

drop policy if exists "own rows" on public.receivable_receipts;
create policy "own rows" on public.receivable_receipts for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop trigger if exists set_updated_at on public.receivable_receipts;
create trigger set_updated_at before update on public.receivable_receipts
  for each row execute function public.set_updated_at();

create or replace function public.receivable_receipts_nao_excede()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_devido  numeric(14,2);
  v_recebido numeric(14,2);
begin
  -- FOR UPDATE serializa dois recebimentos concorrentes do MESMO recebível:
  -- sem o lock, os dois leem o mesmo saldo e ambos passam.
  select r.valor into v_devido
    from public.receivables r
   where r.id = new.receivable_id
     for update;

  if v_devido is null then
    raise exception 'Recebível % não encontrado.', new.receivable_id;
  end if;

  select coalesce(sum(rr.valor), 0) into v_recebido
    from public.receivable_receipts rr
   where rr.receivable_id = new.receivable_id
     and rr.id is distinct from new.id;

  if v_recebido + new.valor > v_devido then
    raise exception
      'A soma dos recebimentos (%) passaria do valor devido (%).',
      v_recebido + new.valor, v_devido
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists receivable_receipts_nao_excede on public.receivable_receipts;
create trigger receivable_receipts_nao_excede
  before insert or update on public.receivable_receipts
  for each row execute function public.receivable_receipts_nao_excede();
```

Confira que o corpo é o do `MIGRATIONS.md` (só o cabeçalho de comentário difere):
`diff <(sed -n '/^-- (1)/,$p' supabase/migrations/20261011210000_receivable_receipts.sql) <(sed -n '/^-- (1) Habilita/,/^create trigger receivable_receipts_nao_excede/{p}' docs/redesign/MIGRATIONS.md)` — ajuste o recorte se necessário; a diferença aceitável é **zero** linhas de SQL (blocos de cerca ```` ``` ```` do markdown à parte).

- [ ] **Step 4: Rode e veja passar**

Run: `npx vitest run src/lib/finance/m1-recebimentos.test.ts`
Expected: PASS. ⚠️ Se algum outro teste varre **todas** as migrations (`npx vitest run src/lib/` inteiro), confira que ficou verde.

- [ ] **Step 5: Commit do arquivo e do teste**

```bash
git add supabase/migrations/20261011210000_receivable_receipts.sql src/lib/finance/m1-recebimentos.test.ts
git commit -F - <<'EOF'
feat(redesign): 03-D A2 — arquivo da M1 (receivable_receipts) e o teste dele

O que muda de natureza: o repositorio passa a ter o SQL da M1 (o de
MIGRATIONS.md, byte a byte no corpo), com o teste que trava RLS+FORCE, a FK
composta, o FOR UPDATE do trigger e a ausencia de backfill.
O que nao muda: NADA foi aplicado no banco. Aplicar exige o "aplique a M1".

Co-Authored-By: <a linha que o seu ambiente indicar>
EOF
```

- [ ] **Step 6: Valide o arquivo**

Dispare o agente `saas-shield-br:migration-validator` com o caminho do `.sql`. Guarde o veredito.

- [ ] **Step 7: PARE e peça a autorização — numa mensagem só para isso**

Mande ao dono, numa mensagem **só com isto**: o SQL do arquivo, o veredito do validador (bloqueantes, atenções) e a frase "Para aplicar, responda literalmente **aplique a M1**." ⛔ Não aplique nada sem essa frase literal. "Pode aplicar", "ok", "sim" **não** contam — pergunte de novo.

Sem o "aplique a M1": pule para a Task 4 e siga só no que não depende da tabela nos tipos (spec §5.2, último parágrafo), declarando o que ficou de fora.

---

### Task 3: A2 (parte 2) — aplicação, tipos, banco e backup (só depois do "aplique a M1")

**Files:**
- Modify: `src/types/supabase.ts` (gerado)
- Modify: `src/lib/finance/quem-le-os-recebimentos.test.ts` (allowlist)
- Modify: `src/lib/settings/export-tables.ts`, `src/lib/settings/export-tables.test.ts`

- [ ] **Step 1: Aplique pelo MCP**

`mcp__claude_ai_Supabase__apply_migration` com `project_id: "yjvnlbjvippefvzgrxxw"`, `name: "receivable_receipts"`, `query`: o conteúdo **inteiro** do arquivo da M1. Anote a versão remota que `list_migrations` devolver.

- [ ] **Step 2: Regenere os tipos pelo MCP e leia o diff**

`mcp__claude_ai_Supabase__generate_typescript_types` (mesmo projeto). Escreva o resultado num arquivo temporário do scratchpad, compare com `src/types/supabase.ts` e aplique **só**: o bloco `receivable_receipts` (`Row`, `Insert`, `Update`, `Relationships`) e o que a M1 mudar em `receivables` (normalmente nada além de, talvez, uma relationship). Tudo o mais que o gerador trouxer (na 03-C2: uma relationship de `import_rows` e a sintaxe nova dos genéricos) **fica fora** e é anotado para a entrega. Confira com `git diff src/types/supabase.ts` que só há linhas de `receivable_receipts`/`receivables`.

- [ ] **Step 3: Allowlist e commit dos tipos**

Em `quem-le-os-recebimentos.test.ts`, `ALLOWLIST` passa a ter:

```ts
  "types/supabase.ts": "tipos gerados do banco (M1)",
```

Run: `npx tsc --noEmit && npx vitest run src/lib/finance/quem-le-os-recebimentos.test.ts`
Expected: limpo e PASS.

```bash
git add src/types/supabase.ts src/lib/finance/quem-le-os-recebimentos.test.ts
git commit -F - <<'EOF'
chore(redesign): 03-D A2 — tipos regenerados com a M1 aplicada

M1 aplicada pelo MCP depois do "aplique a M1" literal do dono (versao remota <X>).
Entraram so as linhas de receivable_receipts (e <o que mais da M1>). Ficaram de
fora, por nao serem desta subfase: <listar o que o gerador trouxe a mais>.

Co-Authored-By: <a linha que o seu ambiente indicar>
EOF
```

- [ ] **Step 4: Confira no banco, só leitura**

`execute_sql`: a tabela existe; `relrowsecurity` e `relforcerowsecurity` verdadeiros em `pg_class` para `receivable_receipts`; a policy `own rows`; os triggers `set_updated_at` e `receivable_receipts_nao_excede`; a constraint `receivables_id_user_uk`; `select count(*) from public.receivable_receipts` = **0**; recebíveis por status ainda 72/0/169/0.

- [ ] **Step 5: Backup (teste primeiro)**

Em `src/lib/settings/export-tables.test.ts`, acrescente:

```ts
  it("inclui receivable_receipts logo depois de receivables (03-D)", () => {
    const i = EXPORT_TABLES.indexOf("receivables");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(EXPORT_TABLES[i + 1]).toBe("receivable_receipts");
  });
```

Run: `npx vitest run src/lib/settings/export-tables.test.ts` — Expected: FAIL nesse caso.

Em `src/lib/settings/export-tables.ts`, logo depois de `"receivables",` (seção da Fase 05 — não toque em nenhuma outra seção):

```ts
  // REDESIGN-03-D — o histórico de recebimentos (M1). Sem ele, restaurar o backup perderia
  // QUANDO e QUANTO cada terceiro pagou, e todo recebimento parcial voltaria como pendente.
  "receivable_receipts",
```

Na allowlist da varredura:

```ts
  "lib/settings/export-tables.ts": "a tabela entra no backup do usuario",
```

Run: `npx vitest run src/lib/settings/ src/lib/finance/quem-le-os-recebimentos.test.ts && npx tsc --noEmit`
Expected: PASS e limpo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings/export-tables.ts src/lib/settings/export-tables.test.ts src/lib/finance/quem-le-os-recebimentos.test.ts
git commit -F - <<'EOF'
feat(redesign): 03-D A2 — receivable_receipts entra no backup

Logo depois de receivables, na secao da Fase 05; nenhuma outra secao tocada.

Co-Authored-By: <a linha que o seu ambiente indicar>
EOF
```

---

### Task 4: A3a — o harness, `LeituraComTeto` fora de `queries.ts`, o tipo da linha e a leitura

**Files:**
- Modify: `src/test/supabase-em-memoria.ts`
- Create: `src/test/supabase-em-memoria.test.ts`
- Create: `src/lib/finance/leitura-com-teto.ts`
- Modify: `src/lib/finance/queries.ts:247-260` (usa o módulo novo; reexporta o tipo)
- Modify: `src/types/database.ts` (seção da Fase 05)
- Create: `src/lib/finance/recebimentos-leitura.ts`

**Interfaces:**
- Produces:
  - harness: `criarSupabaseEmMemoria(tabelas, { userId?, antesDeGravar? })`, com `antesDeGravar: (op: { tabela; tipo: "insert"|"update"|"delete"; valores?: Linha | Linha[]; tabelas: Record<string, Linha[]> }) => { code: string; message: string } | null`; `update(...).select()` devolve as linhas alteradas; `.not(coluna, op, alvo)`.
  - `export type LeituraComTeto<T> = { linhas: T[]; situacao: "completa" | "saturou" | "sem_contagem" }` e `export function leituraComTeto<T>(linhas: T[], count: number | null): LeituraComTeto<T>` em `leitura-com-teto.ts`.
  - `RecebimentoRow = Row<"receivable_receipts">` e `RecebimentoDoBanco = Pick<RecebimentoRow, "id" | "receivable_id" | "valor" | "recebido_em" | "observacoes" | "created_at">` em `types/database.ts`.
  - Em `recebimentos-leitura.ts` (`server-only`): `TETO_DE_RECEBIMENTOS = 5000`; `lerRecebimentos(owner?: LeituraDoDono): Promise<LeituraComTeto<RecebimentoDoBanco>>`; `recebimentosDe(client: ClienteSupabase, receivableIds: readonly string[]): Promise<{ erro: boolean; linhas: RecebimentoDoBanco[] }>`.

- [ ] **Step 1: Teste do harness (vermelho)**

`src/test/supabase-em-memoria.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { criarSupabaseEmMemoria } from "@/test/supabase-em-memoria";

type Builder = { from: (t: string) => any };

describe("harness em memória — extensões da 03-D", () => {
  it("antesDeGravar recusa a escrita, devolve o erro e NÃO registra operação", async () => {
    const fake = criarSupabaseEmMemoria(
      { t: [] },
      { antesDeGravar: ({ tabela }) => (tabela === "t" ? { code: "23514", message: "x" } : null) },
    );
    const r = await (fake.client as Builder).from("t").insert({ a: 1 });
    expect(r.error?.code).toBe("23514");
    expect(fake.tabelas.t).toHaveLength(0);
    expect(fake.escritas("t")).toHaveLength(0);
  });

  it("update().select() devolve as linhas alteradas", async () => {
    const fake = criarSupabaseEmMemoria({ t: [{ id: "1", s: "a" }, { id: "2", s: "b" }] });
    const r = await (fake.client as Builder).from("t").update({ s: "z" }).in("id", ["1"]).select("id");
    expect(r.data).toEqual([{ id: "1", s: "z" }]);
  });

  it("not(coluna, 'is', null) filtra os não nulos", async () => {
    const fake = criarSupabaseEmMemoria({ t: [{ id: "1", x: null }, { id: "2", x: "v" }] });
    const r = await (fake.client as Builder).from("t").select("id").not("x", "is", null);
    expect((r.data as { id: string }[]).map((l) => l.id)).toEqual(["2"]);
  });
});
```

Run: `npx vitest run src/test/supabase-em-memoria.test.ts` — Expected: FAIL nos três.

- [ ] **Step 2: Estenda o harness**

Em `src/test/supabase-em-memoria.ts`:

1. No cabeçalho, acrescente à caixa "O QUE ELE APLICA DE VERDADE": `antesDeGravar` (simula constraint/trigger: a escrita recusada não é gravada nem registrada), `update().select()` e `not(coluna, op, alvo)`.
2. Tipos e assinatura:

```ts
export type ErroSimulado = { code: string; message: string };
export type EscritaPretendida = {
  tabela: string;
  tipo: "insert" | "update" | "delete";
  valores?: Linha | Linha[];
  tabelas: Record<string, Linha[]>;
};

export function criarSupabaseEmMemoria(
  tabelasIniciais: Record<string, Linha[]>,
  opcoes: { userId?: string; antesDeGravar?: (op: EscritaPretendida) => ErroSimulado | null } = {},
) {
```

3. Dentro de `from`: `let devolveAlteradas = false;`; troque `casa` por:

```ts
    const casa = (l: Linha) =>
      filtros.every(([op, col, alvo]) => {
        if (op === "not") {
          const [opInterno, valor] = alvo as [string, unknown];
          return !TESTES[opInterno](l[col], valor);
        }
        return TESTES[op](l[col], alvo);
      });
```

4. No começo de `executar()`, logo depois de `const linhas = (tabelas[tabela] ??= []);`:

```ts
      if (modo !== "select") {
        const erro = opcoes.antesDeGravar?.({ tabela, tipo: modo, valores, tabelas });
        if (erro) {
          executado = { data: null, error: erro };
          return executado;
        }
      }
```

5. No ramo `update`, devolva as alteradas:

```ts
      if (modo === "update") {
        const alteradas: Linha[] = [];
        for (const l of linhas) {
          if (casa(l)) {
            Object.assign(l, valores);
            alteradas.push({ ...l });
          }
        }
        operacoes.push({ tabela, tipo: "update", valores, filtros: [...filtros] });
        executado = { data: devolveAlteradas ? alteradas : null, error: null };
        return executado;
      }
```

6. `builder.select`: `if (modo === "insert") devolveInseridas = true; if (modo === "update") devolveAlteradas = true;`
7. Depois do laço que cria os filtros: 

```ts
    builder.not = (coluna: string, op: string, alvo: unknown) => {
      filtros.push(["not", coluna, [op, alvo]]);
      return builder;
    };
```

Run: `npx vitest run src/test/ src/lib/finance/services.test.ts src/lib/actions/transactions.test.ts`
Expected: PASS (os testes antigos continuam verdes).

- [ ] **Step 3: `LeituraComTeto` sai de `queries.ts`**

`src/lib/finance/leitura-com-teto.ts`:

```ts
/**
 * Leitura com teto visível (03-B2, A5): o `count: "exact"` comparado com o que chegou. Saiu de
 * `queries.ts` na 03-D para a leitura de recebimentos usar a MESMA regra sem import circular.
 */
export type LeituraComTeto<T> = {
  linhas: T[];
  situacao: "completa" | "saturou" | "sem_contagem";
};

/** Compara com o recebido: o max_rows do PostgREST pode cortar antes do nosso limit. */
export function leituraComTeto<T>(linhas: T[], count: number | null): LeituraComTeto<T> {
  return {
    linhas,
    situacao: count === null ? "sem_contagem" : count > linhas.length ? "saturou" : "completa",
  };
}
```

Em `queries.ts`, apague a definição local do tipo e da função (linhas ~249-260), importe `import { leituraComTeto, type LeituraComTeto } from "@/lib/finance/leitura-com-teto";` e reexporte `export type { LeituraComTeto };` (para nenhum import existente quebrar).

- [ ] **Step 4: O tipo da linha**

Em `src/types/database.ts`, seção "Fase 05", depois de `ReceivableRow`:

```ts
/** REDESIGN-03-D (M1) — uma linha de recebimento. `valor` em REAIS; `recebido_em` é data pura. */
export type RecebimentoRow = Row<"receivable_receipts">;
/** O que as leituras trazem de cada recebimento (sem `user_id`, sem as colunas da 04-C). */
export type RecebimentoDoBanco = Pick<
  RecebimentoRow,
  "id" | "receivable_id" | "valor" | "recebido_em" | "observacoes" | "created_at"
>;
```

Allowlist da varredura: `"types/database.ts": "o tipo da linha de recebimento (RecebimentoRow)",`.

- [ ] **Step 5: A leitura**

`src/lib/finance/recebimentos-leitura.ts`:

```ts
import "server-only";
/**
 * REDESIGN-03-D · P3 — A ÚNICA LEITURA de `receivable_receipts`.
 *
 * Consulta própria, nunca embed (a invariante 21 da 16-E registra FK composta impedindo o embed
 * do PostgREST). A junção com os recebíveis é pura (`anexarRecebimentos`). Teto visível:
 * saturado vira motivo de `completude`, nunca um saldo afirmado como exato.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { LeituraDoDono } from "@/lib/supabase/owner";
import { createClient } from "@/lib/supabase/server";
import { dividirEmBlocos, TAMANHO_DO_BLOCO } from "@/lib/finance/receivables-bulk";
import { leituraComTeto, type LeituraComTeto } from "@/lib/finance/leitura-com-teto";
import type { RecebimentoDoBanco } from "@/types/database";

export type ClienteSupabase = SupabaseClient<Database>;

export const TETO_DE_RECEBIMENTOS = 5000;
const COLUNAS = "id, receivable_id, valor, recebido_em, observacoes, created_at";

/** Todos os recebimentos do dono (sessão, ou `owner` no Cron com service role). */
export async function lerRecebimentos(
  owner?: LeituraDoDono,
): Promise<LeituraComTeto<RecebimentoDoBanco>> {
  const supabase = owner?.client ?? (await createClient());
  const base = supabase.from("receivable_receipts").select(COLUNAS, { count: "exact" });
  const { data, count } = await (owner ? base.eq("user_id", owner.userId) : base)
    .order("recebido_em", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(TETO_DE_RECEBIMENTOS);
  return leituraComTeto((data ?? []) as RecebimentoDoBanco[], count);
}

/** Os recebimentos de recebíveis específicos, por blocos (a query string do `in` cresce linear). */
export async function recebimentosDe(
  client: ClienteSupabase,
  receivableIds: readonly string[],
): Promise<{ erro: boolean; linhas: RecebimentoDoBanco[] }> {
  const linhas: RecebimentoDoBanco[] = [];
  for (const bloco of dividirEmBlocos([...new Set(receivableIds)], TAMANHO_DO_BLOCO)) {
    if (bloco.length === 0) continue;
    const { data, error } = await client
      .from("receivable_receipts")
      .select(COLUNAS)
      .in("receivable_id", bloco);
    if (error) return { erro: true, linhas: [] };
    linhas.push(...((data ?? []) as RecebimentoDoBanco[]));
  }
  return { erro: false, linhas };
}
```

Allowlist: `"lib/finance/recebimentos-leitura.ts": "a UNICA leitura da tabela (P3), inclusive a da protecao (A4)",`.

- [ ] **Step 6: Rode, revise e faça o commit**

Run: `npx tsc --noEmit && npx vitest run src/test/ src/lib/finance/ src/lib/actions/`
Expected: limpo e verde.

```bash
git add src/test/supabase-em-memoria.ts src/test/supabase-em-memoria.test.ts src/lib/finance/leitura-com-teto.ts src/lib/finance/queries.ts src/types/database.ts src/lib/finance/recebimentos-leitura.ts src/lib/finance/quem-le-os-recebimentos.test.ts
git commit -F - <<'EOF'
feat(redesign): 03-D A3a — a unica leitura de recebimentos, o tipo da linha e o harness

O que muda de natureza: recebimentos-leitura.ts passa a ser o unico arquivo que
le a tabela (P3), com teto visivel. O harness simula trigger (antesDeGravar),
devolve linhas no update().select() e ganha not().
O que nao muda: nenhum leitor de tela ainda; nenhum numero.

Co-Authored-By: <a linha que o seu ambiente indicar>
EOF
```

---

### Task 5: A3b — o serviço (a única escrita)

**Files:**
- Create: `src/lib/finance/recebimentos-servico.ts`
- Create: `src/lib/finance/recebimentos-servico.test.ts`
- Modify: `src/lib/finance/quem-le-os-recebimentos.test.ts` (allowlist)

**Interfaces:**
- Consumes: `recebimentosDe` (Task 4); `situacao`/regras de `recebimentos.ts` (Task 1); `ORIGENS_DA_ACAO`, `patchDaAcao`, `dividirEmBlocos`, `TAMANHO_DO_BLOCO`, `BulkReceivableAction` (`receivables-bulk.ts` — as origens novas chegam na Task 6; o serviço lê a constante, então muda junto); `invalid`, `dbError`, `AuthContext` (`@/lib/actions/helpers`); `ActionResult` (`@/types/finance`).
- Produces:
  - `type ContextoDoServico = Pick<AuthContext, "supabase" | "userId">`
  - `type DadosDoRecebimento = { receivable_id: string; valor: number; recebido_em: string; observacoes: string | null }`
  - `registrarRecebimento(ctx, dados, hoje): Promise<ActionResult>`
  - `receberSaldo(ctx, id, recebidoEm, hoje): Promise<ActionResult>`
  - `desfazerUltimoRecebimento(ctx, id): Promise<ActionResult>`
  - `decidirRecebivel(ctx, id, decisao: "pendente" | "cobrado" | "ignorado"): Promise<ActionResult>`
  - `aplicarAcaoEmMassa(ctx, ids, acao: BulkReceivableAction, data, hoje): Promise<ActionResult<{ afetados: number; ignorados: number }>>`
  - `mensagemDoSaldo(saldoCentavos: number): string`

- [ ] **Step 1: Os testes (vermelho)**

`src/lib/finance/recebimentos-servico.test.ts`:

```ts
/**
 * REDESIGN-03-D · A3b — o serviço de recebimentos visto pelas escritas, sobre o client em
 * memória (que aplica filtros e registra escritas NA ORDEM). O trigger da M1 é simulado por
 * `antesDeGravar`. Fixture sintética.
 */
import { describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria, type EscritaPretendida, type Linha } from "@/test/supabase-em-memoria";
import type { AuthContext } from "@/lib/actions/helpers";

// O serviço importa `invalid`/`dbError` de `actions/helpers` e a leitura importa `createClient`;
// os dois arrastam o client de servidor. O dublê entra pelo `ctx`, então o módulo é só neutralizado.
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
import {
  aplicarAcaoEmMassa,
  decidirRecebivel,
  desfazerUltimoRecebimento,
  receberSaldo,
  registrarRecebimento,
} from "@/lib/finance/recebimentos-servico";

const REC = "rec-1";
const HOJE = "2026-06-30";

const cent = (v: unknown) => Math.round(Number(v) * 100);

/** O trigger `receivable_receipts_nao_excede`, em memória. */
function gatilhoNaoExcede(op: EscritaPretendida) {
  if (op.tabela !== "receivable_receipts" || op.tipo !== "insert") return null;
  const somaPorRecebivel = new Map<string, number>();
  for (const v of [op.valores].flat() as Linha[]) {
    const id = String(v.receivable_id);
    const devido = cent(op.tabelas.receivables?.find((r) => r.id === id)?.valor);
    const ja =
      somaPorRecebivel.get(id) ??
      (op.tabelas.receivable_receipts ?? [])
        .filter((x) => x.receivable_id === id)
        .reduce((s, x) => s + cent(x.valor), 0);
    const novo = ja + cent(v.valor);
    if (novo > devido) return { code: "23514", message: "A soma dos recebimentos passaria do valor devido." };
    somaPorRecebivel.set(id, novo);
  }
  return null;
}

function cenario(sobre: Linha = {}, recebimentos: Linha[] = [], mais: Linha[] = []) {
  const fake = criarSupabaseEmMemoria(
    {
      receivables: [{ id: REC, user_id: "user-1", valor: 600, status: "pendente", pago_em: null, ...sobre }, ...mais],
      receivable_receipts: recebimentos,
    },
    { antesDeGravar: gatilhoNaoExcede },
  );
  const ctx = { supabase: fake.client as AuthContext["supabase"], userId: "user-1" };
  return { fake, ctx };
}

const receb = (id: string, valor: number, recebido_em: string, created_at = `${recebido_em}T12:00:00Z`): Linha => ({
  id, user_id: "user-1", receivable_id: REC, valor, recebido_em, observacoes: null, created_at,
});

describe("registrar recebimento", () => {
  it("parcial grava SÓ o recebimento — a coluna não muda e nunca vira 'parcial'", async () => {
    const { fake, ctx } = cenario();
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor: 250, recebido_em: "2026-06-05", observacoes: null }, HOJE);
    expect(r.ok).toBe(true);
    expect(fake.escritas("receivables")).toHaveLength(0);
    const [ins] = fake.escritas("receivable_receipts");
    expect(Object.keys(ins.valores as Linha).sort()).toEqual(
      ["observacoes", "recebido_em", "receivable_id", "user_id", "valor"],
    );
    expect(fake.operacoes.some((o) => (o.valores as Linha | undefined)?.status === "parcial")).toBe(false);
  });

  it("o saldo inteiro grava o recebimento e DEPOIS pago + pago_em", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 250, "2026-06-05")]);
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor: 350, recebido_em: "2026-06-20", observacoes: null }, HOJE);
    expect(r.ok).toBe(true);
    expect(fake.operacoes.map((o) => `${o.tipo}:${o.tabela}`)).toEqual([
      "insert:receivable_receipts",
      "update:receivables",
    ]);
    expect(fake.escritas("receivables")[0].valores).toEqual({ status: "pago", pago_em: "2026-06-20" });
  });

  it("valor acima do saldo é recusado NO CAMPO valor, sem gravar nada", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 250, "2026-06-05")]);
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor: 400, recebido_em: "2026-06-20", observacoes: null }, HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.valor?.[0]).toContain("restam");
    expect(fake.operacoes).toHaveLength(0);
  });

  it("o 23514 do trigger (duas abas) vira erro NO CAMPO valor", async () => {
    const fake = criarSupabaseEmMemoria(
      { receivables: [{ id: REC, valor: 600, status: "pendente", pago_em: null }], receivable_receipts: [] },
      { antesDeGravar: (op) => (op.tabela === "receivable_receipts" ? { code: "23514", message: "x" } : null) },
    );
    const ctx = { supabase: fake.client as AuthContext["supabase"], userId: "user-1" };
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor: 100, recebido_em: "2026-06-20", observacoes: null }, HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.valor?.[0]).toMatch(/Passa do saldo/);
    expect(fake.escritas()).toHaveLength(0);
  });

  it.each([
    ["ignorado", { status: "ignorado" }, [], /pendente antes/],
    ["quitado legado", { status: "pago", pago_em: "2026-06-01" }, [], /quitado/],
    ["quitado pela soma", {}, [receb("r1", 600, "2026-06-05")], /quitado/],
  ])("recusa recebimento em %s, sem gravar nada", async (_n, sobre, recs, msg) => {
    const { fake, ctx } = cenario(sobre as Linha, recs as Linha[]);
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor: 10, recebido_em: "2026-06-20", observacoes: null }, HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
    expect(fake.escritas()).toHaveLength(0);
  });

  it("recusa data no futuro (hoje de Brasília injetado), no campo recebido_em", async () => {
    const { fake, ctx } = cenario();
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor: 10, recebido_em: "2026-07-01", observacoes: null }, HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.recebido_em?.[0]).toMatch(/futuro/);
    expect(fake.escritas()).toHaveLength(0);
  });
});

describe("receber o saldo", () => {
  it("grava o recebimento do saldo restante ANTES da coluna", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 250, "2026-06-05")]);
    const r = await receberSaldo(ctx, REC, "2026-06-21", HOJE);
    expect(r.ok).toBe(true);
    expect(fake.operacoes.map((o) => `${o.tipo}:${o.tabela}`)).toEqual([
      "insert:receivable_receipts",
      "update:receivables",
    ]);
    expect((fake.escritas("receivable_receipts")[0].valores as Linha).valor).toBe(350);
  });

  it("com a soma já fechada e a coluna aberta, só conserta a coluna (data do último recebimento)", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 600, "2026-06-05")]);
    const r = await receberSaldo(ctx, REC, "2026-06-21", HOJE);
    expect(r.ok).toBe(true);
    expect(fake.escritas("receivable_receipts")).toHaveLength(0);
    expect(fake.escritas("receivables")[0].valores).toEqual({ status: "pago", pago_em: "2026-06-05" });
  });

  it("recebível de valor ZERO: não cria recebimento de zero, só a coluna", async () => {
    const { fake, ctx } = cenario({ valor: 0 });
    const r = await receberSaldo(ctx, REC, "2026-06-21", HOJE);
    expect(r.ok).toBe(true);
    expect(fake.escritas("receivable_receipts")).toHaveLength(0);
    expect(fake.escritas("receivables")[0].valores).toEqual({ status: "pago", pago_em: "2026-06-21" });
  });

  it("recusa ignorado e data no futuro", async () => {
    expect((await receberSaldo(cenario({ status: "ignorado" }).ctx, REC, "2026-06-21", HOJE)).ok).toBe(false);
    expect((await receberSaldo(cenario().ctx, REC, "2026-07-01", HOJE)).ok).toBe(false);
  });
});

describe("desfazer", () => {
  it("reabre a coluna ANTES de apagar, e apaga SÓ o último", async () => {
    const { fake, ctx } = cenario({ status: "pago", pago_em: "2026-06-20" }, [
      receb("r1", 250, "2026-06-05"),
      receb("r2", 350, "2026-06-20"),
    ]);
    const r = await desfazerUltimoRecebimento(ctx, REC);
    expect(r.ok).toBe(true);
    expect(fake.operacoes.map((o) => `${o.tipo}:${o.tabela}`)).toEqual([
      "update:receivables",
      "delete:receivable_receipts",
    ]);
    expect(fake.escritas("receivables")[0].valores).toEqual({ status: "pendente", pago_em: null });
    expect(fake.tabelas.receivable_receipts.map((x) => x.id)).toEqual(["r1"]);
  });

  it("dois na mesma data: apaga o criado por último", async () => {
    const { fake, ctx } = cenario({}, [
      receb("r1", 100, "2026-06-20", "2026-06-20T10:00:00Z"),
      receb("r2", 100, "2026-06-20", "2026-06-20T11:00:00Z"),
    ]);
    await desfazerUltimoRecebimento(ctx, REC);
    expect(fake.tabelas.receivable_receipts.map((x) => x.id)).toEqual(["r1"]);
  });

  it("parcial com a coluna em aberto: não toca a coluna", async () => {
    const { fake, ctx } = cenario({ status: "cobrado" }, [receb("r1", 100, "2026-06-05")]);
    await desfazerUltimoRecebimento(ctx, REC);
    expect(fake.escritas("receivables")).toHaveLength(0);
    expect(fake.tabelas.receivable_receipts).toHaveLength(0);
  });

  it("legado (pago sem recebimento): só a coluna", async () => {
    const { fake, ctx } = cenario({ status: "pago", pago_em: "2026-06-10" });
    await desfazerUltimoRecebimento(ctx, REC);
    expect(fake.operacoes.map((o) => `${o.tipo}:${o.tabela}`)).toEqual(["update:receivables"]);
  });

  it("nada a desfazer é recusado", async () => {
    expect((await desfazerUltimoRecebimento(cenario().ctx, REC)).ok).toBe(false);
  });
});

describe("decidir (K1)", () => {
  it("ignorar não alcança quitado", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 600, "2026-06-05")]);
    expect((await decidirRecebivel(ctx, REC, "ignorado")).ok).toBe(false);
    expect(fake.escritas()).toHaveLength(0);
  });

  it("ignorar alcança parcial", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 250, "2026-06-05")]);
    expect((await decidirRecebivel(ctx, REC, "ignorado")).ok).toBe(true);
    expect(fake.escritas("receivables")[0].valores).toEqual({ status: "ignorado", pago_em: null });
  });

  it("voltar para pendente não sai de pago (é o Desfazer)", async () => {
    expect((await decidirRecebivel(cenario({ status: "pago", pago_em: "2026-06-01" }).ctx, REC, "pendente")).ok).toBe(false);
  });
});

describe("lote", () => {
  it("receber: um recebimento do SALDO por recebível; ignorado fica de fora", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 250, "2026-06-05")], [
      { id: "rec-2", user_id: "user-1", valor: 100, status: "ignorado", pago_em: null },
    ]);
    const r = await aplicarAcaoEmMassa(ctx, [REC, "rec-2"], "receber", "2026-06-25", HOJE);
    expect(r).toEqual({ ok: true, data: { afetados: 1, ignorados: 1 } });
    expect(fake.operacoes.map((o) => `${o.tipo}:${o.tabela}`)).toEqual([
      "insert:receivable_receipts",
      "update:receivables",
    ]);
    expect((fake.escritas("receivable_receipts")[0].valores as Linha[]).map((v) => v.valor)).toEqual([350]);
  });

  it("desfazer: reabre a coluna ANTES de apagar o último", async () => {
    const { fake, ctx } = cenario({ status: "pago", pago_em: "2026-06-20" }, [receb("r1", 600, "2026-06-20")]);
    await aplicarAcaoEmMassa(ctx, [REC], "desfazer", "2026-06-25", HOJE);
    expect(fake.operacoes.map((o) => `${o.tipo}:${o.tabela}`)).toEqual([
      "update:receivables",
      "delete:receivable_receipts",
    ]);
  });

  it("ignorar não alcança quem a soma já quitou (coluna ainda pendente)", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 600, "2026-06-05")]);
    const r = await aplicarAcaoEmMassa(ctx, [REC], "ignorar", "2026-06-25", HOJE);
    expect(r).toEqual({ ok: true, data: { afetados: 0, ignorados: 1 } });
    expect(fake.escritas("receivables")).toHaveLength(0);
  });
});
```

Run: `npx vitest run src/lib/finance/recebimentos-servico.test.ts` — Expected: FAIL (módulo não existe).

- [ ] **Step 2: Implemente o serviço**

`src/lib/finance/recebimentos-servico.ts`:

```ts
import "server-only";
/**
 * REDESIGN-03-D · A3 — A ÚNICA ESCRITA de `receivable_receipts` (e das transições de status
 * do recebível).
 *
 * ⛔ A COLUNA `status` NUNCA AFIRMA `pago` SEM A SOMA FECHAR (K1). Por isso a ORDEM:
 *   • receber/registrar: o recebimento PRIMEIRO (o trigger é a trava), a coluna DEPOIS;
 *   • desfazer: a coluna PRIMEIRO, o recebimento DEPOIS.
 * A falha no meio deixa sempre "coluna em aberto, soma fechada" — que conta zero em todo total
 * e se conserta com "Receber" —, nunca "coluna `pago`, soma aberta".
 * ⛔ `parcial` nunca é gravado. ⛔ `conta_id`/`transaction_id` nunca são enviados (K2).
 * ⛔ Valor acima do saldo: quem trava é o trigger (`23514`); a pré-checagem existe para a
 *    mensagem e para o legado, que o trigger não vê (K0).
 */
import { dbError, invalid, type AuthContext } from "@/lib/actions/helpers";
import type { ActionResult } from "@/types/finance";
import { centavosParaReais, formatCurrency, reaisParaCentavos } from "@/lib/format";
import {
  anexarRecebimentos,
  emAberto,
  estadoDoRecebivel,
  resumirRecebivel,
  saldoCentavos,
  ultimoRecebimento,
  type EstadoDoRecebivel,
} from "@/lib/finance/recebimentos";
import { recebimentosDe } from "@/lib/finance/recebimentos-leitura";
import {
  ORIGENS_DA_ACAO,
  TAMANHO_DO_BLOCO,
  dividirEmBlocos,
  patchDaAcao,
  type BulkReceivableAction,
} from "@/lib/finance/receivables-bulk";
import type { RecebimentoDoBanco } from "@/types/database";

export type ContextoDoServico = Pick<AuthContext, "supabase" | "userId">;

export type DadosDoRecebimento = {
  receivable_id: string;
  valor: number;
  recebido_em: string;
  observacoes: string | null;
};

const MSG = {
  naoExiste: "O recebível não existe mais (ou não é seu).",
  ignorado: "Volte o recebível para pendente antes de registrar um recebimento.",
  quitado: "Este recebível já está quitado.",
  futuro: "A data do recebimento não pode estar no futuro.",
  nadaADesfazer: "Não há recebimento para desfazer.",
  colunaDepois:
    "O recebimento foi registrado, mas o status não foi atualizado. Clique em Receber para concluir.",
  saldoMudou: "O saldo deste recebível mudou enquanto você recebia. Atualize a tela e confira.",
  desconhecido: "O status deste recebível não é reconhecido.",
} as const;

export function mensagemDoSaldo(saldoCentavos: number): string {
  return `Passa do saldo deste recebível: restam ${formatCurrency(centavosParaReais(saldoCentavos))}.`;
}

type Lido = {
  id: string;
  valor: number;
  status: string;
  pago_em: string | null;
  recebimentos: RecebimentoDoBanco[];
};

async function lerRecebivel(ctx: ContextoDoServico, id: string): Promise<Lido | null | "erro"> {
  const { data, error } = await ctx.supabase
    .from("receivables")
    .select("id, valor, status, pago_em")
    .eq("id", id)
    .maybeSingle();
  if (error) return "erro";
  if (!data) return null;
  const recs = await recebimentosDe(ctx.supabase, [id]);
  if (recs.erro) return "erro";
  return { ...(data as Omit<Lido, "recebimentos">), recebimentos: recs.linhas };
}

function situacao(r: Lido): { estado: EstadoDoRecebivel; saldo: number } {
  const resumido = resumirRecebivel(r);
  return { estado: estadoDoRecebivel(resumido), saldo: saldoCentavos(resumido) };
}

const campoValor = (saldo: number): ActionResult<never> => invalid({ valor: [mensagemDoSaldo(saldo)] });

/** Registrar um recebimento (parcial ou total). */
export async function registrarRecebimento(
  ctx: ContextoDoServico,
  dados: DadosDoRecebimento,
  hoje: string,
): Promise<ActionResult> {
  if (dados.recebido_em > hoje) return invalid({ recebido_em: [MSG.futuro] });

  const lido = await lerRecebivel(ctx, dados.receivable_id);
  if (lido === "erro") return dbError("Não foi possível ler o recebível.");
  if (!lido) return dbError(MSG.naoExiste);

  const { estado, saldo } = situacao(lido);
  if (estado === "desconhecido") return dbError(MSG.desconhecido);
  if (estado === "ignorado") return dbError(MSG.ignorado);
  if (saldo <= 0) return dbError(MSG.quitado);

  const valorCent = reaisParaCentavos(dados.valor);
  if (valorCent <= 0) return invalid({ valor: ["Informe um valor maior que zero."] });
  if (valorCent > saldo) return campoValor(saldo);

  const { error } = await ctx.supabase.from("receivable_receipts").insert({
    user_id: ctx.userId,
    receivable_id: lido.id,
    valor: dados.valor,
    recebido_em: dados.recebido_em,
    observacoes: dados.observacoes,
  });
  if (error) {
    if (error.code === "23514") {
      const releitura = await lerRecebivel(ctx, lido.id);
      return campoValor(releitura && releitura !== "erro" ? situacao(releitura).saldo : 0);
    }
    return dbError("Não foi possível registrar o recebimento.");
  }

  if (valorCent === saldo) {
    const { error: erroDaColuna } = await ctx.supabase
      .from("receivables")
      .update({ status: "pago", pago_em: dados.recebido_em })
      .eq("id", lido.id);
    if (erroDaColuna) return dbError(MSG.colunaDepois);
  }
  return { ok: true, data: undefined };
}

/** "Receber": um recebimento do saldo restante, e a coluna em `pago`. */
export async function receberSaldo(
  ctx: ContextoDoServico,
  id: string,
  recebidoEm: string,
  hoje: string,
): Promise<ActionResult> {
  if (recebidoEm > hoje) return invalid({ recebido_em: [MSG.futuro] });

  const lido = await lerRecebivel(ctx, id);
  if (lido === "erro") return dbError("Não foi possível ler o recebível.");
  if (!lido) return dbError(MSG.naoExiste);

  const { estado, saldo } = situacao(lido);
  if (estado === "desconhecido") return dbError(MSG.desconhecido);
  if (estado === "ignorado") return dbError(MSG.ignorado);
  if (lido.status === "pago" && saldo <= 0) return dbError(MSG.quitado);

  if (saldo <= 0) {
    // Soma fechada com a coluna em aberto (falha anterior entre as duas escritas), ou
    // recebível de valor zero: só a coluna — nunca um recebimento de zero.
    const data = ultimoRecebimento(lido.recebimentos)?.recebido_em ?? recebidoEm;
    const { error } = await ctx.supabase
      .from("receivables")
      .update({ status: "pago", pago_em: data })
      .eq("id", lido.id);
    return error ? dbError("Não foi possível marcar como recebido.") : { ok: true, data: undefined };
  }

  const { error } = await ctx.supabase.from("receivable_receipts").insert({
    user_id: ctx.userId,
    receivable_id: lido.id,
    valor: centavosParaReais(saldo),
    recebido_em: recebidoEm,
    observacoes: null,
  });
  if (error) return dbError(error.code === "23514" ? MSG.saldoMudou : "Não foi possível marcar como recebido.");

  const { error: erroDaColuna } = await ctx.supabase
    .from("receivables")
    .update({ status: "pago", pago_em: recebidoEm })
    .eq("id", lido.id);
  if (erroDaColuna) return dbError(MSG.colunaDepois);
  return { ok: true, data: undefined };
}

/** "Desfazer": o ÚLTIMO recebimento (P6). A coluna sai de `pago` ANTES de apagar. */
export async function desfazerUltimoRecebimento(
  ctx: ContextoDoServico,
  id: string,
): Promise<ActionResult> {
  const lido = await lerRecebivel(ctx, id);
  if (lido === "erro") return dbError("Não foi possível ler o recebível.");
  if (!lido) return dbError(MSG.naoExiste);

  const ultimo = ultimoRecebimento(lido.recebimentos);
  if (!ultimo && lido.status !== "pago") return dbError(MSG.nadaADesfazer);

  if (lido.status === "pago") {
    const { error } = await ctx.supabase
      .from("receivables")
      .update({ status: "pendente", pago_em: null })
      .eq("id", lido.id);
    if (error) return dbError("Não foi possível desfazer o recebimento.");
  }
  if (!ultimo) return { ok: true, data: undefined }; // legado: só a coluna

  const { error } = await ctx.supabase
    .from("receivable_receipts")
    .delete()
    .eq("id", ultimo.id)
    .eq("receivable_id", lido.id);
  if (error) {
    return dbError("O recebível voltou para pendente, mas o recebimento não foi removido. Tente de novo.");
  }
  return { ok: true, data: undefined };
}

/** As decisões do dono: cobrado, ignorado e voltar para pendente (K1). */
export async function decidirRecebivel(
  ctx: ContextoDoServico,
  id: string,
  decisao: "pendente" | "cobrado" | "ignorado",
): Promise<ActionResult> {
  const lido = await lerRecebivel(ctx, id);
  if (lido === "erro") return dbError("Não foi possível ler o recebível.");
  if (!lido) return dbError(MSG.naoExiste);
  const { estado } = situacao(lido);

  if (decisao === "cobrado" && !(lido.status === "pendente" && emAberto(resumirRecebivel(lido)))) {
    return dbError("Só um recebível pendente pode ser marcado como cobrado.");
  }
  if (decisao === "ignorado") {
    if (estado === "ignorado") return dbError("Este recebível já está marcado como não cobrado.");
    if (!emAberto(resumirRecebivel(lido))) {
      return dbError("Este recebível já está quitado: desfaça o recebimento antes de ignorar.");
    }
  }
  if (decisao === "pendente") {
    if (lido.status === "pago") return dbError("Use Desfazer para reabrir um recebível recebido.");
    if (lido.status === "pendente") return { ok: true, data: undefined };
  }

  const { error } = await ctx.supabase
    .from("receivables")
    .update({ status: decisao, pago_em: null })
    .eq("id", lido.id);
  return error ? dbError("Não foi possível atualizar o recebível.") : { ok: true, data: undefined };
}

function falhaNoMeio(afetados: number, detalhe?: string): ActionResult<never> {
  return dbError(
    detalhe ??
      (afetados > 0
        ? `Falha no meio do lote. ${afetados} recebível(is) foram atualizados; tente novamente para o restante.`
        : "Não foi possível aplicar a ação aos recebíveis."),
  );
}

/** O lote, com as MESMAS regras e a MESMA ordem das ações de um item só. */
export async function aplicarAcaoEmMassa(
  ctx: ContextoDoServico,
  ids: readonly string[],
  acao: BulkReceivableAction,
  data: string,
  hoje: string,
): Promise<ActionResult<{ afetados: number; ignorados: number }>> {
  if (acao === "receber" && data > hoje) return invalid({ pago_em: [MSG.futuro] });
  const unicos = [...new Set(ids)];
  let afetados = 0;

  for (const bloco of dividirEmBlocos(unicos, TAMANHO_DO_BLOCO)) {
    const { data: linhas, error } = await ctx.supabase
      .from("receivables")
      .select("id, valor, status, pago_em")
      .in("id", bloco)
      .in("status", ORIGENS_DA_ACAO[acao]);
    if (error) return falhaNoMeio(afetados);
    const recs = await recebimentosDe(ctx.supabase, (linhas ?? []).map((l) => l.id));
    if (recs.erro) return falhaNoMeio(afetados);
    const lidos = anexarRecebimentos((linhas ?? []) as Omit<Lido, "recebimentos">[], recs.linhas);

    if (acao === "cobrado" || acao === "ignorar") {
      const alvo = lidos
        .filter((r) => (acao === "ignorar" ? emAberto(resumirRecebivel(r)) : situacao(r).estado !== "pago"))
        .map((r) => r.id);
      if (alvo.length === 0) continue;
      const { data: alterados, error: e } = await ctx.supabase
        .from("receivables")
        .update(patchDaAcao(acao, data))
        .in("id", alvo)
        .in("status", ORIGENS_DA_ACAO[acao])
        .select("id");
      if (e) return falhaNoMeio(afetados);
      afetados += alterados?.length ?? 0;
      continue;
    }

    if (acao === "receber") {
      const novos: { user_id: string; receivable_id: string; valor: number; recebido_em: string; observacoes: null }[] = [];
      const alvo: string[] = [];
      for (const r of lidos) {
        const { estado, saldo } = situacao(r);
        if (!emAberto(resumirRecebivel(r)) && estado !== "pago") continue;
        if (saldo > 0) {
          novos.push({ user_id: ctx.userId, receivable_id: r.id, valor: centavosParaReais(saldo), recebido_em: data, observacoes: null });
        }
        alvo.push(r.id);
      }
      if (novos.length > 0) {
        const { error: e } = await ctx.supabase.from("receivable_receipts").insert(novos);
        if (e) return falhaNoMeio(afetados, e.code === "23514" ? MSG.saldoMudou : undefined);
      }
      if (alvo.length === 0) continue;
      const { data: alterados, error: e } = await ctx.supabase
        .from("receivables")
        .update({ status: "pago", pago_em: data })
        .in("id", alvo)
        .select("id");
      if (e) return falhaNoMeio(afetados, MSG.colunaDepois);
      afetados += alterados?.length ?? 0;
      continue;
    }

    // desfazer — origem: coluna `pago`. A coluna PRIMEIRO, o último recebimento DEPOIS.
    const alvo = lidos.map((r) => r.id);
    if (alvo.length === 0) continue;
    const { data: alterados, error: e } = await ctx.supabase
      .from("receivables")
      .update({ status: "pendente", pago_em: null })
      .in("id", alvo)
      .in("status", ["pago"])
      .select("id");
    if (e) return falhaNoMeio(afetados);
    afetados += alterados?.length ?? 0;
    const ultimos = lidos
      .map((r) => ultimoRecebimento(r.recebimentos)?.id)
      .filter((x): x is string => Boolean(x));
    if (ultimos.length > 0) {
      const { error: e2 } = await ctx.supabase.from("receivable_receipts").delete().in("id", ultimos);
      if (e2) {
        return falhaNoMeio(afetados, "Os recebíveis voltaram para pendente, mas os recebimentos não foram removidos. Tente de novo.");
      }
    }
  }

  return { ok: true, data: { afetados, ignorados: unicos.length - afetados } };
}
```

Allowlist da varredura: `"lib/finance/recebimentos-servico.ts": "a UNICA escrita da tabela (A3)",`.

⚠️ O teste "lote → receber… ignorado fica de fora" depende de `ORIGENS_DA_ACAO.receber` **já** sem `"ignorado"`. Por isso a mudança das origens (K1) vem **nesta** Task: em `receivables-bulk.ts`, `receber: ["pendente", "cobrado"]` e `ignorar: ["pendente", "cobrado"]` (comentário: "K1 (03-D): só se recebe e só se perdoa o que ainda se deve"), e em `receivables-bulk.test.ts` faça agora o que a Task 6 Step 3 descreve (o caso de "ignorar" reescrito e o caso novo de "receber não alcança ignorado").

- [ ] **Step 3: Rode e veja passar**

Run: `npx vitest run src/lib/finance/`
Expected: PASS — inclusive `receivables-bulk.test.ts` com os dois casos ajustados.

- [ ] **Step 4: Commit**

```bash
git add src/lib/finance/recebimentos-servico.ts src/lib/finance/recebimentos-servico.test.ts src/lib/finance/quem-le-os-recebimentos.test.ts src/lib/finance/receivables-bulk.ts src/lib/finance/receivables-bulk.test.ts
git commit -F - <<'EOF'
feat(redesign): 03-D A3b — o servico de recebimentos (a unica escrita)

O que muda de natureza: registrar, receber o saldo, desfazer o ultimo, decidir e
o lote passam por um servico so, com a ordem que impede a coluna de afirmar pago
sem a soma fechar (K1). Ignorar e Receber deixam de alcancar pago e ignorado.
O que nao muda: nenhuma tela chama o servico ainda; nenhum numero.

Co-Authored-By: <a linha que o seu ambiente indicar>
EOF
```

---

### Task 6: A3c — schemas, actions e o lote

**Files:**
- Modify: `src/lib/validators/receivable.ts`
- Create: `src/lib/validators/receivable.test.ts`
- Modify: `src/lib/validators/round-trip.test.ts`
- Modify: `src/lib/actions/receivables.ts`
- Create: `src/lib/actions/receivables.test.ts`
- Modify: `src/lib/finance/receivables-bulk.test.ts` (se não feito na Task 5)

**Interfaces:**
- Produces: `registrarRecebimentoSchema`, `receberSaldoSchema`, `type RegistrarRecebimentoInput`; actions `registrarRecebimentoAction(input: unknown)`, `desfazerRecebimentoAction(id: string)`, e as existentes `markReceivableReceived(id, pagoEm?)`, `setReceivableStatus(id, status)`, `bulkSetReceivableStatus(input)`, `updateReceivable(id, input)` com a mesma assinatura.

- [ ] **Step 1: Teste dos schemas (vermelho)**

`src/lib/validators/receivable.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { receberSaldoSchema, registrarRecebimentoSchema } from "@/lib/validators/receivable";

const ID = "8b2e4d10-1c3f-4e55-9a02-6d7b8c9e0f11";
const base = { receivable_id: ID, valor: "250,00", recebido_em: "2026-06-05", observacoes: "" };

describe("registrarRecebimentoSchema", () => {
  it.each([
    ["250,00", 250],
    ["R$ 1.234,56", 1234.56],
    [" 50 ", 50],
    [250, 250],
  ])("aceita o valor BR %s → %s", (valor, esperado) => {
    const r = registrarRecebimentoSchema.safeParse({ ...base, valor });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.valor).toBe(esperado);
  });

  it.each(["0", "0,00", "-10"])("recusa %s no campo valor", (valor) => {
    const r = registrarRecebimentoSchema.safeParse({ ...base, valor });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.valor?.length).toBeGreaterThan(0);
  });

  it("observação vazia vira null", () => {
    const r = registrarRecebimentoSchema.parse(base);
    expect(r.observacoes).toBeNull();
  });

  it.each(["conta_id", "transaction_id"])("K2: recusa %s (.strict)", (chave) => {
    expect(registrarRecebimentoSchema.safeParse({ ...base, [chave]: ID }).success).toBe(false);
  });

  it("recusa data fora do formato", () => {
    expect(registrarRecebimentoSchema.safeParse({ ...base, recebido_em: "05/06/2026" }).success).toBe(false);
  });
});

describe("receberSaldoSchema", () => {
  it("data opcional", () => {
    expect(receberSaldoSchema.safeParse({ id: ID }).success).toBe(true);
    expect(receberSaldoSchema.safeParse({ id: ID, recebido_em: "2026-06-05" }).success).toBe(true);
  });
});
```

Em `round-trip.test.ts`, no padrão do arquivo, acrescente o caso de `registrarRecebimentoSchema` (o formulário manda a saída transformada; `parse(parse(x))` tem de funcionar) — com `observacoes: null` na segunda volta.

Run: `npx vitest run src/lib/validators/` — Expected: FAIL.

- [ ] **Step 2: Os schemas**

Em `src/lib/validators/receivable.ts`:

```ts
import { dateString, normalizeBRMoney, optionalText } from "@/lib/validators/shared";

/**
 * REDESIGN-03-D — registrar um recebimento. ⛔ `.strict()` e SEM `conta_id`/`transaction_id`
 * (K2: o recebimento só registra; o vínculo com o lançamento é da 04-C). `user_id` vem sempre
 * de `auth.getUser()`. A data no futuro é recusada no SERVIÇO, com `hoje` de Brasília.
 */
export const registrarRecebimentoSchema = z
  .object({
    receivable_id: z.uuid("Recebível inválido"),
    valor: z.preprocess(
      normalizeBRMoney,
      z.coerce
        .number({ message: "Informe um valor" })
        .finite("Valor inválido")
        .positive("Informe um valor maior que zero."),
    ),
    recebido_em: dateString,
    observacoes: optionalText(500),
  })
  .strict();

export type RegistrarRecebimentoInput = z.infer<typeof registrarRecebimentoSchema>;

/** "Receber" o saldo restante. Data ausente → hoje (na action). */
export const receberSaldoSchema = z
  .object({ id: z.uuid("Recebível inválido"), recebido_em: dateString.optional() })
  .strict();
```

(Confira que `normalizeBRMoney` é exportado de `shared.ts` — é; ele já é usado por `moneyAmount`.)

Run: `npx vitest run src/lib/validators/` — Expected: PASS.

- [ ] **Step 3: O lote (feito na Task 5 — aqui só a referência do que mudou)**

Em `receivables-bulk.ts`: `receber: ["pendente", "cobrado"]` e `ignorar: ["pendente", "cobrado"]`, com o comentário "K1 (03-D): só se recebe e só se perdoa o que ainda se deve". Em `receivables-bulk.test.ts`:
- o caso *"ignorar alcança tudo menos o que já está ignorado"* vira *"ignorar alcança só o que ainda se deve (pendente e cobrado) — K1"*, com `ids` `["a", "b"]` e `naoAlcancados` `2`;
- acrescente *"receber não alcança ignorado — volte para pendente antes (K1)"*: `alcanceDaAcao(["d"], visiveis, "receber").ids` → `[]`.

- [ ] **Step 4: As actions viram casca**

Reescreva `src/lib/actions/receivables.ts` mantendo `updateReceivable` como está:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { hojeISO } from "@/lib/format";
import type { ReceivableStatus } from "@/lib/finance/constants";
import {
  aplicarAcaoEmMassa,
  decidirRecebivel,
  desfazerUltimoRecebimento,
  receberSaldo,
  registrarRecebimento,
} from "@/lib/finance/recebimentos-servico";
import {
  bulkReceivablesSchema,
  receberSaldoSchema,
  registrarRecebimentoSchema,
} from "@/lib/validators/receivable";
import type { ActionResult } from "@/types/finance";

function revalidateReceivables() {
  revalidatePath("/terceiros");
  revalidatePath("/faturas");
  revalidatePath("/parcelamentos");
}

/** "Receber": recebimento do saldo restante + coluna em `pago` (K1). Data padrão: hoje. */
export async function markReceivableReceived(id: string, pagoEm?: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const parsed = receberSaldoSchema.safeParse({ id, ...(pagoEm ? { recebido_em: pagoEm } : {}) });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const hoje = hojeISO();
  const res = await receberSaldo(ctx, parsed.data.id, parsed.data.recebido_em ?? hoje, hoje);
  if (res.ok) revalidateReceivables();
  return res;
}

/** Registrar um recebimento (parcial ou total). */
export async function registrarRecebimentoAction(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const parsed = registrarRecebimentoSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const res = await registrarRecebimento(ctx, parsed.data, hojeISO());
  if (res.ok) revalidateReceivables();
  return res;
}

/** "Desfazer": remove o ÚLTIMO recebimento (ou reabre o legado). */
export async function desfazerRecebimentoAction(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const parsed = receberSaldoSchema.safeParse({ id });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const res = await desfazerUltimoRecebimento(ctx, parsed.data.id);
  if (res.ok) revalidateReceivables();
  return res;
}

/**
 * Decisões do dono: cobrado, ignorado e voltar para pendente. `pago` NÃO entra por aqui:
 * quitar é sempre por recebimento (K1), e sair de `pago` é o Desfazer.
 */
export async function setReceivableStatus(id: string, status: ReceivableStatus): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (status !== "pendente" && status !== "cobrado" && status !== "ignorado") {
    return dbError("Use Receber para marcar como recebido.");
  }
  const res = await decidirRecebivel(ctx, id, status);
  if (res.ok) revalidateReceivables();
  return res;
}

/**
 * Ação em massa. O filtro de status de origem é REAPLICADO no servidor, o UPDATE vai em
 * BLOCOS e `afetados` é contado pelas linhas que o banco devolveu (garantias da Fase 05,
 * agora dentro de `aplicarAcaoEmMassa`).
 */
export async function bulkSetReceivableStatus(
  input: unknown,
): Promise<ActionResult<{ afetados: number; ignorados: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const parsed = bulkReceivablesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const hoje = hojeISO();
  const res = await aplicarAcaoEmMassa(ctx, parsed.data.ids, parsed.data.acao, parsed.data.pago_em ?? hoje, hoje);
  if (res.ok) revalidateReceivables();
  return res;
}

// updateReceivable — inalterada (copie a função atual para cá, sem mudar nada).
```

⚠️ `src/lib/actions/receivables.ts` está na lista `NUNCA` da varredura: ele **não** pode conter a string da tabela — e não contém.

- [ ] **Step 5: Teste das cascas**

`src/lib/actions/receivables.test.ts` (padrão de `transactions.test.ts`: `vi.mock("@/lib/supabase/server", ...)` devolvendo o dublê e `vi.mock("next/cache", ...)`):
- `setReceivableStatus(id, "pago")` → `{ ok: false }` com "Use Receber" e **zero** escritas;
- `registrarRecebimentoAction({ ...válido, conta_id: ID })` → `{ ok: false }` (K2) e zero escritas;
- `registrarRecebimentoAction` válido → uma escrita em `receivable_receipts`.

Run: `npx vitest run src/lib/validators/ src/lib/actions/ src/lib/finance/ && npx tsc --noEmit`
Expected: verde e limpo. O `terceiros-client.tsx` continua compilando (as assinaturas usadas por ele não mudaram).

- [ ] **Step 6: Commit**

```bash
git add src/lib/validators/receivable.ts src/lib/validators/receivable.test.ts src/lib/validators/round-trip.test.ts src/lib/actions/receivables.ts src/lib/actions/receivables.test.ts src/lib/finance/receivables-bulk.ts src/lib/finance/receivables-bulk.test.ts
git commit -F - <<'EOF'
feat(redesign): 03-D A3c — schemas e actions de recebimento viram casca do servico

O que muda de natureza: registrar e desfazer recebimento passam a existir;
setReceivableStatus nao aceita mais pago (quitar e sempre por recebimento);
o schema e .strict() sem conta_id/transaction_id (K2).
O que nao muda: assinaturas das actions que a tela ja usa; nenhum numero.

Co-Authored-By: <a linha que o seu ambiente indicar>
EOF
```

---

### Task 7: A4 — ninguém apaga dinheiro que entrou (os cinco pontos)

**Files:**
- Create: `src/lib/finance/protecao-do-recebivel.ts`, `src/lib/finance/protecao-do-recebivel.test.ts`
- Modify: `src/lib/finance/recebimentos-leitura.ts` (acrescenta `protecaoDosRecebiveis`)
- Modify: `src/lib/finance/split.ts` (`MOTIVO_RECEBIVEL_FECHADO`), `src/lib/finance/split-reapply.ts:100-111`
- Modify: `src/lib/actions/installments.ts:311-325`, `src/lib/actions/imports.ts:978-986`, `src/lib/actions/transactions.ts:263-275`, `src/lib/finance/services.ts:237-255`
- Modify/Create tests: `src/lib/actions/transactions.test.ts`, `src/lib/actions/installments.test.ts` (novo), `src/lib/actions/imports-desfazer.test.ts` (novo), `src/lib/finance/services.test.ts`

**Interfaces:**
- Produces:
  - `type RecebivelParaProteger = { readonly status: string; readonly temRecebimento: boolean }`
  - `type AlcanceDaProtecao = "regra-cheia" | "so-dinheiro-registrado"`
  - `type AcaoQueApaga = "alterar a divisão" | "cancelar as parcelas futuras" | "desfazer a importação" | "excluir o lançamento"`
  - `recebivelProtegido(r, alcance): boolean`
  - `motivoParaNaoApagar(recs, alcance, acao): string | null`
  - em `recebimentos-leitura.ts`: `protecaoDosRecebiveis(client, filtro: { transactionIds: readonly string[] } | { installmentIds: readonly string[] }): Promise<{ erro: true } | { erro: false; recebiveis: RecebivelParaProteger[] }>`

- [ ] **Step 1: A regra pura (teste vermelho, depois implementação)**

`src/lib/finance/protecao-do-recebivel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { motivoParaNaoApagar, recebivelProtegido } from "@/lib/finance/protecao-do-recebivel";

describe("A4 — a regra única", () => {
  it.each([
    ["pendente", false, "regra-cheia", false],
    ["pendente", true, "regra-cheia", true],
    ["cobrado", false, "regra-cheia", true],
    ["pago", false, "regra-cheia", true],
    ["ignorado", false, "regra-cheia", true],
    ["pago", false, "so-dinheiro-registrado", false],
    ["ignorado", false, "so-dinheiro-registrado", false],
    ["pendente", true, "so-dinheiro-registrado", true],
  ] as const)("%s, recebimento=%s, %s → %s", (status, temRecebimento, alcance, esperado) => {
    expect(recebivelProtegido({ status, temRecebimento }, alcance)).toBe(esperado);
  });

  it("a mensagem diz por quê e o que fazer", () => {
    const m = motivoParaNaoApagar([{ status: "pendente", temRecebimento: true }], "regra-cheia", "excluir o lançamento");
    expect(m).toMatch(/recebimento registrado/);
    expect(m).toMatch(/antes de excluir o lançamento/);
    expect(motivoParaNaoApagar([{ status: "ignorado", temRecebimento: false }], "regra-cheia", "alterar a divisão"))
      .toMatch(/decidiu não cobrar/);
    expect(motivoParaNaoApagar([{ status: "pendente", temRecebimento: false }], "regra-cheia", "alterar a divisão")).toBeNull();
  });
});
```

`src/lib/finance/protecao-do-recebivel.ts`:

```ts
/**
 * REDESIGN-03-D · A4 — NINGUÉM APAGA DINHEIRO QUE ENTROU. Uma regra, pura; os cinco pontos que
 * apagam recebível (direto ou por cascade) a chamam e nenhum a reimplementa.
 *
 * - "regra-cheia": recebimento registrado, ou status `cobrado`/`pago`/`ignorado` (o `ignorado`
 *   entrou com o B1, D11: apagá-lo mudaria minha despesa em silêncio).
 * - "so-dinheiro-registrado": só recebimento registrado — `deleteTransaction` e o desfazer da IA
 *   (decisão (b) do dono): a regra cheia neles bloquearia hoje a exclusão de até 170 lançamentos.
 */
export type RecebivelParaProteger = { readonly status: string; readonly temRecebimento: boolean };
export type AlcanceDaProtecao = "regra-cheia" | "so-dinheiro-registrado";
export type AcaoQueApaga =
  | "alterar a divisão"
  | "cancelar as parcelas futuras"
  | "desfazer a importação"
  | "excluir o lançamento";

const STATUS_PROTEGIDOS = ["cobrado", "pago", "ignorado"];

export function recebivelProtegido(r: RecebivelParaProteger, alcance: AlcanceDaProtecao): boolean {
  if (r.temRecebimento) return true;
  return alcance === "regra-cheia" && STATUS_PROTEGIDOS.includes(r.status);
}

export function motivoParaNaoApagar(
  recs: readonly RecebivelParaProteger[],
  alcance: AlcanceDaProtecao,
  acao: AcaoQueApaga,
): string | null {
  const comDinheiro = recs.filter((r) => r.temRecebimento).length;
  if (comDinheiro > 0) {
    return `Há ${comDinheiro} recebível(is) com recebimento registrado. Desfaça o recebimento em A Receber antes de ${acao}.`;
  }
  if (alcance === "so-dinheiro-registrado") return null;
  const decididos = recs.filter((r) => STATUS_PROTEGIDOS.includes(r.status)).length;
  if (decididos > 0) {
    return `Há ${decididos} recebível(is) cobrado(s), recebido(s) ou que você decidiu não cobrar. Acerte-os em A Receber antes de ${acao}.`;
  }
  return null;
}
```

- [ ] **Step 2: A leitura da proteção**

Em `recebimentos-leitura.ts`, acrescente:

```ts
import type { RecebivelParaProteger } from "@/lib/finance/protecao-do-recebivel";

/** O que a A4 precisa saber: status de cada recebível do alvo e se ele já recebeu algo. */
export async function protecaoDosRecebiveis(
  client: ClienteSupabase,
  filtro: { readonly transactionIds: readonly string[] } | { readonly installmentIds: readonly string[] },
): Promise<{ erro: true } | { erro: false; recebiveis: RecebivelParaProteger[] }> {
  const coluna = "transactionIds" in filtro ? "transaction_id" : "installment_id";
  const alvo = "transactionIds" in filtro ? filtro.transactionIds : filtro.installmentIds;
  const linhas: { id: string; status: string }[] = [];
  for (const bloco of dividirEmBlocos([...new Set(alvo)], TAMANHO_DO_BLOCO)) {
    if (bloco.length === 0) continue;
    const { data, error } = await client.from("receivables").select("id, status").in(coluna, bloco);
    if (error) return { erro: true };
    linhas.push(...((data ?? []) as { id: string; status: string }[]));
  }
  const recs = await recebimentosDe(client, linhas.map((l) => l.id));
  if (recs.erro) return { erro: true };
  const comRecebimento = new Set(recs.linhas.map((x) => x.receivable_id));
  return {
    erro: false,
    recebiveis: linhas.map((l) => ({ status: l.status, temRecebimento: comRecebimento.has(l.id) })),
  };
}
```

- [ ] **Step 3: Os testes dos cinco pontos (vermelho)**

1. `src/lib/actions/transactions.test.ts` — acrescente ao fim, reusando os helpers do arquivo (`despesaCompartilhada`, `payload`, `fake`):

```ts
describe("03-D · A4 — recebimento registrado bloqueia", () => {
  const recebimento = { id: "rr-1", user_id: "user-1", receivable_id: "rc-1", valor: 100, recebido_em: "2026-06-05", created_at: "2026-06-05T10:00:00Z" };

  it("reapplySplit: recebível PENDENTE com recebimento parcial recusa a mudança de divisão e não grava nada", async () => {
    fake = criarSupabaseEmMemoria({ ...despesaCompartilhada("pendente"), receivable_receipts: [recebimento] });
    const r = await updateTransaction(ID, payload({ type: "despesa", classificacao: "pessoal" }));
    expect(r).toEqual({ ok: false, error: MOTIVO_RECEBIVEL_FECHADO });
    expect(fake.escritas()).toHaveLength(0);
  });

  it("reapplySplit: recebível IGNORADO também bloqueia (D11)", async () => {
    fake = criarSupabaseEmMemoria(despesaCompartilhada("ignorado"));
    const r = await updateTransaction(ID, payload({ type: "despesa", classificacao: "pessoal" }));
    expect(r).toEqual({ ok: false, error: MOTIVO_RECEBIVEL_FECHADO });
  });

  it("deleteTransaction: lançamento com recebimento registrado é recusado, sem escrita", async () => {
    fake = criarSupabaseEmMemoria({ ...despesaCompartilhada("pendente"), receivable_receipts: [recebimento] });
    const r = await deleteTransaction(ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/recebimento registrado/);
    expect(fake.escritas()).toHaveLength(0);
  });

  it("deleteTransaction: recebível PAGO legado sem recebimento continua deixando excluir (b)", async () => {
    fake = criarSupabaseEmMemoria(despesaCompartilhada("pago"));
    const r = await deleteTransaction(ID);
    expect(r.ok).toBe(true);
    expect(fake.escritas("transactions").map((o) => o.tipo)).toEqual(["delete"]);
  });
});
```

(Acrescente `deleteTransaction` ao `await import("@/lib/actions/transactions")` do topo. Ajuste o `payload(...)` ao formato exato que o arquivo já usa para uma edição despesa→pessoal — copie de um caso existente que chega ao `reapplySplit`.)

2. `src/lib/actions/installments.test.ts` (novo; mesmo cabeçalho de mocks de `transactions.test.ts`):

```ts
const { cancelInstallmentFuture } = await import("@/lib/actions/installments");

it("cancelar parcelas futuras com recebimento registrado é recusado, sem escrita", async () => {
  fake = criarSupabaseEmMemoria({
    transaction_installments: [{ id: "inst-1", parent_transaction_id: "tx-p", statement_id: "st-1", status: "ativa", valor: 100 }],
    card_statements: [{ id: "st-1", data_fechamento: "2099-01-10", data_vencimento: "2099-01-20", pago_em: null }],
    receivables: [{ id: "rc-1", installment_id: "inst-1", transaction_id: "tx-p", status: "pendente", valor: 50 }],
    receivable_receipts: [{ id: "rr-1", receivable_id: "rc-1", valor: 10, recebido_em: "2026-06-05", created_at: "2026-06-05T10:00:00Z" }],
  });
  const r = await cancelInstallmentFuture("tx-p");
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toMatch(/recebimento registrado/);
  expect(fake.escritas()).toHaveLength(0);
});
```

E o mesmo com `status: "ignorado"` e sem recebimento → recusado com "decidiu não cobrar".

3. `src/lib/actions/imports-desfazer.test.ts` (novo):

```ts
const { undoImportBatch } = await import("@/lib/actions/imports");

it("desfazer a importação com recebimento registrado é recusado, sem escrita", async () => {
  fake = criarSupabaseEmMemoria({
    import_batches: [{ id: "lote-1", status: "importado" }],
    import_rows: [{ id: "ir-1", import_batch_id: "lote-1", transaction_id: "tx-imp", status: "importada" }],
    transactions: [{ id: "tx-imp", statement_id: null }],
    transaction_installments: [],
    card_statements: [],
    receivables: [{ id: "rc-1", transaction_id: "tx-imp", status: "pendente", valor: 100 }],
    receivable_receipts: [{ id: "rr-1", receivable_id: "rc-1", valor: 40, recebido_em: "2026-06-05", created_at: "2026-06-05T10:00:00Z" }],
  });
  const r = await undoImportBatch("lote-1");
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toMatch(/recebimento registrado/);
  expect(fake.escritas()).toHaveLength(0);
});
```

4. `src/lib/finance/services.test.ts` — acrescente: `excluirTransacaoSimples` com recebível + recebimento → `{ ok: false, erro }` com "recebimento registrado" e zero escritas.

Run: `npx vitest run src/lib/actions/ src/lib/finance/services.test.ts` — Expected: FAIL nos casos novos.

- [ ] **Step 4: Ligue os cinco pontos**

1. `split.ts` — o texto:

```ts
export const MOTIVO_RECEBIVEL_FECHADO =
  "Esta divisão já tem recebível cobrado, recebido, com recebimento registrado ou que você decidiu não cobrar. Acerte-o em A Receber antes de alterar a divisão.";
```

(o comentário de `DecisaoReaplicacao` passa a dizer "protegido pela A4" em vez de "cobrado/pago").

2. `split-reapply.ts` — troque o bloco `let temRecebivelFechado … }` por:

```ts
  // REDESIGN-03-D · A4 — a regra única: recebimento registrado, cobrado, pago ou ignorado.
  let temRecebivelFechado = false;
  if (divisaoAtual.size > 0) {
    const protecao = await protecaoDosRecebiveis(ctx.supabase, { transactionIds: [args.transactionId] });
    if (protecao.erro) {
      return { ok: false, error: "Não foi possível conferir os recebíveis desta divisão. Tente de novo." };
    }
    temRecebivelFechado = protecao.recebiveis.some((r) => recebivelProtegido(r, "regra-cheia"));
  }
```

3. `installments.ts` — troque a leitura `receivables … some(cobrado||pago)` por:

```ts
  const protecao = await protecaoDosRecebiveis(ctx.supabase, { installmentIds: ids });
  if (protecao.erro) return dbError("Não foi possível conferir os recebíveis das parcelas. Tente de novo.");
  const motivo = motivoParaNaoApagar(protecao.recebiveis, "regra-cheia", "cancelar as parcelas futuras");
  if (motivo) return dbError(motivo);
```

e, mais abaixo, `if ((recebiveis ?? []).length > 0)` vira `if (protecao.recebiveis.length > 0)`.

4. `imports.ts` (`undoImportBatch`) — troque o bloco `const { data: recs } … }` por:

```ts
  const protecao = await protecaoDosRecebiveis(ctx.supabase, { transactionIds: txIds });
  if (protecao.erro) return dbError("Não foi possível conferir os recebíveis deste lote. Tente de novo.");
  const motivo = motivoParaNaoApagar(protecao.recebiveis, "regra-cheia", "desfazer a importação");
  if (motivo) return dbError(motivo);
```

5. `transactions.ts` (`deleteTransaction`) — logo depois de ler `existing` e **antes** de `statementPaidBy`:

```ts
  // REDESIGN-03-D · A4 (decisão (b)) — o cascade levaria o registro do dinheiro que entrou.
  const protecao = await protecaoDosRecebiveis(ctx.supabase, { transactionIds: [id] });
  if (protecao.erro) return dbError("Não foi possível conferir os recebíveis deste lançamento. Tente de novo.");
  const motivo = motivoParaNaoApagar(protecao.recebiveis, "so-dinheiro-registrado", "excluir o lançamento");
  if (motivo) return dbError(motivo);
```

6. `services.ts` (`excluirTransacaoSimples`) — logo depois da recusa de transferência:

```ts
  const protecao = await protecaoDosRecebiveis(ctx.supabase, { transactionIds: [id] });
  if (protecao.erro) return { ok: false, erro: "Não foi possível conferir os recebíveis deste lançamento." };
  const motivo = motivoParaNaoApagar(protecao.recebiveis, "so-dinheiro-registrado", "excluir o lançamento");
  if (motivo) return { ok: false, erro: motivo };
```

Imports: `protecaoDosRecebiveis` de `@/lib/finance/recebimentos-leitura` e `motivoParaNaoApagar`/`recebivelProtegido` de `@/lib/finance/protecao-do-recebivel`. Nenhum desses seis arquivos passa a conter a string da tabela.

Run: `npx vitest run src/lib/actions/ src/lib/finance/ && npx tsc --noEmit`
Expected: verde (inclusive `transactions.test.ts` antigo, que compara com `MOTIVO_RECEBIVEL_FECHADO` pela constante) e limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/protecao-do-recebivel.ts src/lib/finance/protecao-do-recebivel.test.ts src/lib/finance/recebimentos-leitura.ts src/lib/finance/split.ts src/lib/finance/split-reapply.ts src/lib/actions/installments.ts src/lib/actions/imports.ts src/lib/actions/transactions.ts src/lib/finance/services.ts src/lib/actions/transactions.test.ts src/lib/actions/installments.test.ts src/lib/actions/imports-desfazer.test.ts src/lib/finance/services.test.ts
git commit -F - <<'EOF'
feat(redesign): 03-D A4 — ninguem apaga dinheiro que entrou (cinco pontos, uma regra)

O que muda de natureza: reapplySplit, cancelar parcelas e desfazer importacao
protegem recebimento registrado, cobrado, pago e ignorado; deleteTransaction e o
desfazer da IA protegem recebimento registrado (decisao (b)).
O que nao muda: com o dado de hoje (0 recebimento, 0 ignorado) nenhuma operacao
que funcionava deixa de funcionar.

Co-Authored-By: <a linha que o seu ambiente indicar>
EOF
```

---

### Task 8: A5 — a tela de terceiros

**Files:**
- Modify: `src/lib/finance/queries.ts` (`lerRecebiveis` junta os recebimentos)
- Modify: `src/types/database.ts` (`ReceivableWithRelations` ganha `recebimentos: RecebimentoDoBanco[]`)
- Modify: `src/lib/finance/constants.ts` (`RECEIVABLE_STATUS_LABELS.ignorado = "Não será cobrado"`)
- Modify: `src/components/financeiro/badges.tsx` (`EstadoDoRecebivelBadge`)
- Modify: `src/app/(app)/terceiros/terceiros-client.tsx`
- Create: `src/app/(app)/terceiros/registrar-recebimento-dialog.tsx`
- Create: `src/app/(app)/terceiros/terceiros-client.test.ts`

**Interfaces:**
- Consumes: `lerRecebimentos`, `anexarRecebimentos`, `resumirRecebivel`, `estadoDoRecebivel`, `emAberto`, `saldoCentavos`, `secoesDaLista`, `ultimoRecebimento`, `ESTADO_LABELS`, `ESTADOS_DO_RECEBIVEL`, `registrarRecebimentoAction`, `desfazerRecebimentoAction`.
- Produces: `lerRecebiveis(owner?)` devolve `LeituraComTeto<ReceivableWithRelations> & { situacaoDosRecebimentos: LeituraComTeto<unknown>["situacao"] }`; `EstadoDoRecebivelBadge({ estado })`; `RegistrarRecebimentoDialog({ open, onOpenChange, receivableId, saldo, pessoa })`.

- [ ] **Step 1: A leitura junta os recebimentos**

Em `queries.ts`, `lerRecebiveis` passa a ler os dois em paralelo e juntar:

```ts
async function lerRecebiveis(
  owner?: LeituraDoDono,
): Promise<LeituraComTeto<ReceivableWithRelations> & { situacaoDosRecebimentos: LeituraComTeto<unknown>["situacao"] }> {
  const supabase = owner?.client ?? (await createClient());
  const base = supabase.from("receivables").select(RECEIVABLE_SELECT, { count: "exact" });
  const [{ data, count }, recebimentos] = await Promise.all([
    (owner ? base.eq("user_id", owner.userId) : base)
      .order("created_at", { ascending: false })
      .limit(TETO_DE_RECEBIVEIS),
    lerRecebimentos(owner),
  ]);
  const linhas = anexarRecebimentos(
    (data ?? []) as unknown as Omit<ReceivableWithRelations, "recebimentos">[],
    recebimentos.linhas,
  );
  return { ...leituraComTeto(linhas, count), situacaoDosRecebimentos: recebimentos.situacao };
}
```

E em `types/database.ts`: `ReceivableWithRelations = ReceivableRow & { …; recebimentos: RecebimentoDoBanco[] }`.

Run: `npx tsc --noEmit` — corrija o que o compilador apontar (o pipeline aceita a linha com o campo a mais).

- [ ] **Step 2: Rótulo e selo**

`constants.ts`: `ignorado: "Não será cobrado",` (P8). `badges.tsx`, depois de `ReceivableStatusBadge`:

```tsx
const ESTADO_CLASSES: Record<EstadoDoRecebivel, string> = {
  pendente: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20",
  parcial: "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/20",
  cobrado: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20",
  pago: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
  // D11: o perdoado NÃO é riscado — ele conta, como despesa minha.
  ignorado: "bg-muted text-muted-foreground ring-1 ring-border",
  desconhecido: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
};

/** Selo do estado DERIVADO (03-D): a soma manda; `parcial` nunca é gravado. */
export function EstadoDoRecebivelBadge({ estado }: { estado: EstadoDoRecebivel }) {
  return (
    <Badge variant="secondary" className={cn("border-0", ESTADO_CLASSES[estado])}>
      {ESTADO_LABELS[estado]}
    </Badge>
  );
}
```

- [ ] **Step 3: A varredura da fiação (vermelho)**

`src/app/(app)/terceiros/terceiros-client.test.ts`:

```ts
/**
 * 03-D · A5 — fiação da tela por varredura do fonte (o projeto não tem teste de componente,
 * invariante 25). A REGRA está em `recebimentos.test.ts`; aqui só se prova que a tela a usa.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const semComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const FONTE = semComentarios(
  fs.readFileSync(path.join(process.cwd(), "src", "app", "(app)", "terceiros", "terceiros-client.tsx"), "utf8"),
);

describe("03-D · A5 — a tela de terceiros", () => {
  it("não declara cópia local de status em aberto", () => {
    expect(FONTE).not.toMatch(/const\s+OPEN_STATUSES\b/);
  });
  it("as seções saem de secoesDaLista, e 'Não será cobrado' é uma delas (D11)", () => {
    expect(FONTE).toMatch(/secoesDaLista\(/);
    expect(FONTE).toMatch(/naoSeraCobrado/);
    expect(FONTE).toContain("Não será cobrado");
  });
  it("o estado é o DERIVADO", () => {
    expect(FONTE).toMatch(/estadoDoRecebivel\(/);
    expect(FONTE).toMatch(/EstadoDoRecebivelBadge/);
  });
  it("o diálogo de recebimento entra por next/dynamic + useLazyDialog", () => {
    expect(FONTE).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(["']\.\/registrar-recebimento-dialog["']\)/);
    expect(FONTE).toMatch(/useLazyDialog\(/);
  });
});
```

Run: `npx vitest run "src/app/(app)/terceiros/"` — Expected: FAIL.

- [ ] **Step 4: O diálogo**

`src/app/(app)/terceiros/registrar-recebimento-dialog.tsx` — `"use client"`, React Hook Form + `zodResolver(registrarRecebimentoSchema.omit({ receivable_id: true }))`, campos **valor** (`Input` `inputMode="decimal"`, padrão = saldo formatado `"350,00"`), **data** (`type="date"`, padrão gerado no handler que abre — nunca no corpo do componente) e **observação** (`Textarea`). No submit: `registrarRecebimentoAction({ receivable_id, ...values })`; erro → `mapServerFieldErrors(res.fieldErrors, ["valor", "recebido_em", "observacoes"])` → `setError` nos conhecidos e `toast.error` com os órfãos; sucesso → `toast.success("Recebimento registrado.")`, fecha e `router.refresh()`. `DialogContent className="sm:max-w-md"` (regra 1 do layout: o limite do celular vem da primitiva). Título "Registrar recebimento"; descrição "{pessoa} · restam {saldo}".

- [ ] **Step 5: A tela**

Em `terceiros-client.tsx`:
1. **Apague** `const OPEN_STATUSES: ReceivableStatus[] = ["pendente", "cobrado"];`. Os KPIs **não mudam de número aqui**: onde ele era usado para os KPIs ("Total a receber", "A receber de {pessoa}"), use `RECEIVABLE_OPEN_STATUSES` de `@/lib/finance/constants` (mesmos valores). O B3/B4 trocam depois.
2. `const estadoDe = (r: ReceivableWithRelations) => estadoDoRecebivel(resumirRecebivel(r));`
3. Filtro "Status": opções `ESTADOS_DO_RECEBIVEL` com `ESTADO_LABELS`; filtro por `estadoDe(r) === status`.
4. Seções: `const secoes = secoesDaLista(filtered, estadoDe);` → **Em aberto** (`secoes.emAberto`), **Não será cobrado** (`secoes.naoSeraCobrado`, com a frase "Você decidiu não cobrar. O valor conta como despesa sua." sob o título) e **Histórico** (`secoes.historico`). `visiveis = [...secoes.emAberto, ...secoes.naoSeraCobrado, ...secoes.historico]`.
5. `ReceivableCard`:
   - `const resumido = resumirRecebivel(r); const estado = estadoDoRecebivel(resumido); const saldo = saldoCentavos(resumido) / 100;`
   - selo `<EstadoDoRecebivelBadge estado={estado} />`, e `<ReceivableStatusBadge status="cobrado" />` ao lado quando `estado === "parcial" && r.status === "cobrado"`;
   - valor: mostra `formatCurrency(r.valor)`; com recebimento e em aberto, abaixo, "restam {formatCurrency(saldo)}"; com `ignorado`, "não será cobrado: {formatCurrency(perdoadoCentavos(resumido)/100)}";
   - **histórico** (recolhível, `<details>` nativo para não pesar): cada recebimento "DD/MM/AAAA · R$ X · observação"; legado (pago sem recebimento): "Recebido em DD/MM/AAAA (registro anterior ao histórico)";
   - botões pela K1: **Receber** se `emAberto(resumido)` (`markReceivableReceived(r.id)`); **Desfazer** se `r.recebimentos.length > 0 || r.status === "pago"` (`desfazerRecebimentoAction(r.id)`, toast "Último recebimento desfeito."); menu: **Registrar recebimento** se `emAberto`, **Marcar como cobrado** se `r.status === "pendente" && emAberto`, **Ignorar** se `emAberto`, **Voltar para pendente** se `r.status === "cobrado" || r.status === "ignorado"`;
   - todo texto ao lado de botão/selo com `min-w-0`/`truncate` (regra 2 do layout).
6. O diálogo: `const RegistrarRecebimentoDialog = dynamic(() => import("./registrar-recebimento-dialog").then((m) => m.RegistrarRecebimentoDialog), { ssr: false });` no topo (objeto literal, regra 4); estado `aberto`/`alvo` no `TerceirosClient`; `const montado = useLazyDialog(aberto);` e `{montado && <RegistrarRecebimentoDialog … />}`.

Run: `npx vitest run "src/app/(app)/terceiros/" src/lib/finance/ && npx tsc --noEmit && npm run lint`
Expected: verde, limpo.

- [ ] **Step 6: Bundle e visual**

Run: `npm run build && npm run perf:bundle` e o medidor das seis rotas (fora do repositório, como no spec §2.2). Anote `/(app)/terceiros` antes (219,3) × depois.
Visual: claro e escuro, 390 px, sem rolagem horizontal — pela extensão do Chrome ou, se ela não conectar, pelo componente isolado (HTML estático com o CSS do build num iframe de 390 px), declarando a limitação.

- [ ] **Step 7: Commit**

```bash
git add src/lib/finance/queries.ts src/types/database.ts src/lib/finance/constants.ts src/components/financeiro/badges.tsx "src/app/(app)/terceiros/terceiros-client.tsx" "src/app/(app)/terceiros/registrar-recebimento-dialog.tsx" "src/app/(app)/terceiros/terceiros-client.test.ts"
git commit -F - <<'EOF'
feat(redesign): 03-D A5 — /terceiros mostra saldo, parcial, historico e "Nao sera cobrado"

O que muda de natureza: o estado exibido e o DERIVADO (a soma manda); cada
recebivel mostra o saldo e o historico; ignorado ganha secao propria (D11); o
dialogo de registrar recebimento chega sob demanda.
O que nao muda: os KPIs (B3/B4 os mudam); /terceiros <antes> → <depois> KB gz.

Co-Authored-By: <a linha que o seu ambiente indicar>
EOF
```

---

### Task 9: A6 — o encanamento (o motor recebe `recebido` e os ids, sem usar)

**Files:**
- Modify: `src/lib/finance/dashboard.ts` (só tipos: `DashTx.id?`, `DashReceivable.transaction_id?`, `DashReceivable.recebido?`)
- Modify: `src/lib/finance/pipeline.ts` (`LinhaTx.id`, `LinhaRecebivel`, `montarEntradas`)
- Modify: `src/lib/finance/queries.ts` (`lerFinanceiro`: motivo de completude dos recebimentos; `getReceivablesByStatements`; `getInstallmentPurchases`)
- Modify: `src/types/database.ts` (`ReceivableWithPerson.recebimentos`; os recebíveis embutidos da compra parcelada ganham `recebimentos?`)
- Modify: `src/lib/notifications/cron.ts` (select de transações com `id`; de recebíveis com `transaction_id, pago_em`; junta `lerRecebimentos({ client: service, userId })`)
- Modify: `src/lib/finance/pipeline.test.ts`, `src/lib/finance/ler-financeiro.test.ts` (fixtures com os campos novos)

**Interfaces:**
- Produces: `DashTx.id?: string`; `DashReceivable.transaction_id?: string | null`; `DashReceivable.recebido?: number`; `LinhaTx.id: string`; `LinhaRecebivel = { id: string; statement_id; installment_id; transaction_id: string | null; valor; status; pago_em: string | null; statement; transaction; recebimentos: readonly RecebimentoLido[] }`.

- [ ] **Step 1: O teste do encanamento (vermelho)**

Em `pipeline.test.ts`, acrescente:

```ts
it("03-D · A6 — todo DashReceivable montado tem `recebido` e `transaction_id` definidos (P1)", () => {
  const { recs } = montarEntradas({
    recebiveis: [
      { id: "r1", statement_id: "st", installment_id: null, transaction_id: "tx-1", valor: 600, status: "pendente", pago_em: null, statement: null, transaction: null, recebimentos: [{ valor: 250, recebido_em: "2026-06-05" }] },
      { id: "r2", statement_id: "st", installment_id: null, transaction_id: null, valor: "100.00", status: "pago", pago_em: "2026-06-10", statement: null, transaction: null, recebimentos: [] },
    ],
  });
  expect(recs.map((r) => [r.transaction_id, r.recebido])).toEqual([["tx-1", 250], [null, 100]]);
});
```

e, no bloco de `montarEntradas` para transações, que `txs[i].id` é o `id` da linha.

Run: `npx vitest run src/lib/finance/pipeline.test.ts` — Expected: FAIL (tsc/campo ausente).

- [ ] **Step 2: Tipos e montagem**

`dashboard.ts` — **só** tipos (nenhuma função os lê ainda):

```ts
export type DashTx = {
  /** 03-D (B1, à vista): liga o recebível ao lançamento. Opcional — `dashboard.test.ts` não muda. */
  id?: string;
  // …campos atuais
};

export type DashReceivable = {
  // …campos atuais
  /** 03-D: o lançamento de origem (D11 à vista). Opcional pelo mesmo motivo; o pipeline sempre preenche. */
  transaction_id?: string | null;
  /** 03-D: Σ recebido em REAIS, já com a K0 aplicada. Sem data (P2). Ausente = K0 sobre lista vazia. */
  recebido?: number;
};
```

`pipeline.ts`: `LinhaTx` ganha `id: string`; `LinhaRecebivel` ganha `id: string`, `transaction_id: string | null`, `pago_em: string | null`, `recebimentos: readonly RecebimentoLido[]` (importe o tipo de `@/lib/finance/recebimentos`); em `montarEntradas`, `id: t.id` no `txs` e, no `recs`:

```ts
      transaction_id: r.transaction_id,
      recebido: resumirRecebivel({
        valor: num(r.valor),
        status: r.status,
        pago_em: r.pago_em,
        recebimentos: r.recebimentos,
      }).recebido,
```

- [ ] **Step 3: As leituras**

- `lerFinanceiro`: depois do bloco de recebíveis, se `recebiveis.situacaoDosRecebimentos === "saturou"` → motivo "A leitura de recebimentos trouxe {N} registros e havia mais: os saldos podem estar incompletos."; `"sem_contagem"` → "Não foi possível confirmar que a leitura de recebimentos veio completa.".
- `getReceivablesByStatements`: lê os recebíveis como hoje **e** `lerRecebimentos()` em paralelo; devolve `anexarRecebimentos(...)`. `ReceivableWithPerson` ganha `recebimentos: RecebimentoDoBanco[]`.
- `getInstallmentPurchases`: no embed `receivables!receivables_transaction_id_fkey(...)` acrescente `pago_em`; lê `lerRecebimentos()` em paralelo e, para cada compra, troca `r.receivables` por `anexarRecebimentos(r.receivables ?? [], recebimentos.linhas)`. No tipo dos recebíveis embutidos (`types/database.ts`, o `receivables?: {...}[]` de `TransactionWithRelations`), acrescente `pago_em?: string | null` e `recebimentos?: RecebimentoDoBanco[]` — **opcionais**, porque a lista de lançamentos usa o mesmo tipo e não os lê.
- `cron.ts`: no select de `transactions` acrescente `id`; no de `receivables` acrescente `transaction_id, pago_em`; leia `lerRecebimentos({ client: service, userId })` no mesmo `Promise.all` e entregue a `montarEntradas` `recebiveis: anexarRecebimentos(receivablesRes.data ?? [], recebimentosDoDono.linhas)`. (`cron.ts` está na lista `NUNCA`: ele **não** nomeia a tabela — quem nomeia é `lerRecebimentos`.)

- [ ] **Step 4: Fixtures e prova de que não move número**

`pipeline.test.ts` e `ler-financeiro.test.ts`: acrescente `id`/`transaction_id`/`pago_em`/`recebimentos: []` às fixtures de linha que o `tsc` apontar, e os campos novos aos mapeamentos de referência do Cron (sem mudar número).

Run: `npx vitest run src/lib/ && npx tsc --noEmit && git diff --quiet 17a93e9 -- src/lib/finance/dashboard.test.ts src/lib/finance/dashboard-caracterizacao.test.ts && echo IGUAIS`
Expected: verde, limpo, `IGUAIS`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/dashboard.ts src/lib/finance/pipeline.ts src/lib/finance/queries.ts src/types/database.ts src/lib/notifications/cron.ts src/lib/finance/pipeline.test.ts src/lib/finance/ler-financeiro.test.ts
git commit -F - <<'EOF'
feat(redesign): 03-D A6 — o encanamento: o motor recebe recebido e os ids, sem usar

O que muda de natureza: DashTx.id, DashReceivable.transaction_id e .recebido (Σ
em reais, K0 aplicada, sem data — P2) chegam ao motor; /faturas, /parcelamentos e
o Cron leem os recebimentos pela leitura unica.
O que nao muda: nenhuma funcao do motor os le ainda; dashboard.test.ts e a
caracterizacao identicos (git diff --quiet).

Co-Authored-By: <a linha que o seu ambiente indicar>
EOF
```

---

### Task 10: B1a — D11 no motor, nos relatórios e nos cards

**Files:**
- Modify: `src/lib/finance/dashboard.ts`
- Create: `src/lib/finance/dashboard-recebimentos.test.ts`
- Modify: `src/lib/finance/dashboard-caracterizacao.test.ts` — **só** C1–C7 e C9–C12 (spec §7)
- Modify: `src/lib/reports/queries.ts`, `src/lib/dashboard/queries.ts`, `src/lib/dashboard/types.ts`
- Modify: `src/components/dashboard/general/finance-card.tsx`, `src/app/(app)/dashboard/financeiro/page.tsx` + `financial-dashboard-client.tsx`, `src/app/(app)/relatorios/relatorios-client.tsx`
- Modify: fixtures de `FinanceCardData` em `src/lib/ai/tools/adapters/finance.test.ts` e `src/lib/ai/insights/collectors/finance.test.ts` (campo `perdoado: 0`)

**Interfaces:**
- Produces: `perdoadoDoMes({ mes, transactions, statements, receivables }): number` (reais) em `dashboard.ts`; `FinanceCardData.perdoado: number`; `ReportsData["finance"].perdoado: number`.

- [ ] **Step 1: Os testes novos (vermelho)**

`src/lib/finance/dashboard-recebimentos.test.ts`:

```ts
/**
 * REDESIGN-03-D · B1a/B4 — o recebimento e o perdoado no motor. Fixture sintética (§9).
 */
import { describe, expect, it } from "vitest";
import {
  gastosPorCategoria,
  perdoadoDoMes,
  proximas6Faturas,
  resumoMes,
  type DashReceivable,
  type DashStatement,
  type DashTx,
} from "@/lib/finance/dashboard";

const MES = "2026-06";
const st = (over: Partial<DashStatement> = {}): DashStatement => ({
  id: "st-9", card_id: "card-9", competencia: "2026-06-01", data_fechamento: "2026-06-10",
  data_vencimento: "2026-06-20", pago_em: null, total_atual: 1000, ...over,
});
const rec = (over: Partial<DashReceivable> = {}): DashReceivable => ({
  statement_id: "st-9", installment_id: null, valor: 600, status: "pendente", transaction_id: null, recebido: 0, ...over,
});
const tx = (over: Partial<DashTx> = {}): DashTx => ({
  id: "tx-av", amount: 1000, valor_pessoal: 400, type: "despesa", payment_method: "pix", status: "pago",
  competence_date: "2026-06-15", card_id: null, statement_id: null, parcelado: false, category_id: null, category: null, ...over,
});
const resumo = (receivables: DashReceivable[], transactions: DashTx[] = []) =>
  resumoMes({ mes: MES, transactions, statements: transactions.length ? [] : [st()], receivables });

describe("B1a — D11: o perdoado vira despesa minha", () => {
  it("ignorado sem recebimento: 400/600 → 1000/0, perdoado 600", () => {
    const r = resumo([rec({ status: "ignorado" })]);
    expect([r.cartaoMeu, r.terceiros]).toEqual([1000, 0]);
    expect(perdoadoDoMes({ mes: MES, transactions: [], statements: [st()], receivables: [rec({ status: "ignorado" })] })).toBe(600);
  });

  it("ignorado com 250 recebidos (K3-a): 750/250, perdoado 350", () => {
    const rs = [rec({ status: "ignorado", recebido: 250 })];
    const r = resumo(rs);
    expect([r.cartaoMeu, r.terceiros]).toEqual([750, 250]);
    expect(perdoadoDoMes({ mes: MES, transactions: [], statements: [st()], receivables: rs })).toBe(350);
  });

  it.each(["pendente", "cobrado", "pago"])("%s com recebimento parcial continua 400/600 (D3)", (status) => {
    const r = resumo([rec({ status, recebido: 250 })]);
    expect([r.cartaoMeu, r.terceiros]).toEqual([400, 600]);
  });

  it("à vista em conta: ignorado vinculado pelo transaction_id sobe a minha parte 400 → 1000", () => {
    const transacoes = [tx()];
    const recs = [rec({ statement_id: null, transaction_id: "tx-av", status: "ignorado" })];
    const r = resumoMes({ mes: MES, transactions: transacoes, statements: [], receivables: recs });
    expect(r.aVistaMeu).toBe(1000);
    expect(perdoadoDoMes({ mes: MES, transactions: transacoes, statements: [], receivables: recs })).toBe(600);
    const [fatia] = gastosPorCategoria({ mes: MES, transactions: transacoes, statements: [], installmentItems: [], receivables: recs });
    expect(fatia.meu).toBe(1000);
  });

  it("parcela: ignorado sai do desconto da parcela", () => {
    const [fatia] = gastosPorCategoria({
      mes: MES, transactions: [], statements: [st()],
      installmentItems: [{ id: "inst", statement_id: "st-9", valor: 500, status: "ativa", parent: { category: { id: "c", name: "Categoria", color: null } } }],
      receivables: [rec({ statement_id: null, installment_id: "inst", valor: 100, status: "ignorado" })],
    });
    expect(fatia.meu).toBe(500);
  });

  it("próximas faturas: ignorado sai dos terceiros", () => {
    const [f] = proximas6Faturas({
      hoje: "2026-06-15",
      cards: [{ id: "card-9", nome: "Cartao", cor: null, limite_total: 1000, dia_fechamento: 10, dia_vencimento: 20 }],
      statements: [st({ competencia: "2026-07-01", total_atual: 500 })],
      receivables: [rec({ valor: 100, status: "ignorado" })],
      n: 1,
    });
    expect([f.meu, f.terceiros]).toEqual([500, 0]);
  });

  it("a conta fecha: saídas = meu + terceiros, e meu − perdoado = parte acordada", () => {
    const recs = [rec({ status: "ignorado", recebido: 250 }), rec({ valor: 100, status: "pendente" })];
    const efetiva = resumo(recs);
    expect(efetiva.saidas).toBe(efetiva.meu + efetiva.terceiros);
    const acordada = resumo(recs.map((r) => ({ ...r, status: r.status === "ignorado" ? "pendente" : r.status })));
    const perdoado = perdoadoDoMes({ mes: MES, transactions: [], statements: [st()], receivables: recs });
    expect(efetiva.meu - perdoado).toBeCloseTo(acordada.meu, 2);
  });

  it("sem ignorado e sem recebimento, nada muda (equivalência com o dado de hoje)", () => {
    for (const status of ["pendente", "cobrado", "pago"]) {
      const comCampos = resumo([rec({ status })]);
      const semCampos = resumo([{ statement_id: "st-9", installment_id: null, valor: 600, status }]);
      expect(comCampos).toEqual(semCampos);
    }
  });
});
```

Run: `npx vitest run src/lib/finance/dashboard-recebimentos.test.ts` — Expected: FAIL (`perdoadoDoMes` não existe; números antigos).

- [ ] **Step 2: O motor**

Em `dashboard.ts`:

```ts
import { parteDoTerceiroCentavos, perdoadoCentavos } from "@/lib/finance/recebimentos";

/** D11 à vista: o perdoado dos recebíveis de UM lançamento sem parcela, por `transaction_id`. */
function perdoadoPorLancamento(receivables: DashReceivable[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const r of receivables) {
    if (r.installment_id || !r.transaction_id) continue;
    const p = perdoadoCentavos(r);
    if (p !== 0) mapa.set(r.transaction_id, (mapa.get(r.transaction_id) ?? 0) + p);
  }
  return mapa;
}
```

- `somaTerceirosDasFaturas`: `total += parteDoTerceiroCentavos(r);` (em vez de `cent(r.valor)`).
- `resumoMes`: `const perdoadoAVista = perdoadoPorLancamento(receivables);` antes do laço; no ramo à vista `aVistaMeuCent += meuCentavos(t) + (t.id ? perdoadoAVista.get(t.id) ?? 0 : 0);`.
- `buildSpendItems`: `recByInstallment` soma `parteDoTerceiroCentavos(r)`; os itens à vista **e** à-vista-do-cartão usam `meuCent = meuCentavos(t) + (t.id ? perdoado.get(t.id) ?? 0 : 0)` (com `const perdoado = perdoadoPorLancamento(receivables)`).
- `proximas6Faturas`: `recByStatement` soma `parteDoTerceiroCentavos(r)`.
- Nova função exportada:

```ts
/**
 * 03-D (B1a, P11) — o perdoado do mês: o que entra em `meu` por causa da D11. Mesmas regras de
 * `resumoMes` (à vista pela competência do lançamento; cartão pela competência da fatura), então
 * `resumoMes(...).meu − perdoadoDoMes(...)` é a parte ACORDADA. Função, e não chave de
 * `ResumoMes`: a chave mudaria `toEqual` sem número nenhum mudar.
 */
export function perdoadoDoMes(params: {
  mes: string;
  transactions: DashTx[];
  statements: DashStatement[];
  receivables: DashReceivable[];
}): number {
  const { mes, transactions, statements, receivables } = params;
  const porLancamento = perdoadoPorLancamento(receivables);
  let total = 0;
  for (const t of transactions) {
    if (!ativo(t) || t.type !== "despesa" || mesDe(t.competence_date) !== mes) continue;
    if (t.card_id === null && !t.parcelado && t.id) total += porLancamento.get(t.id) ?? 0;
  }
  const ids = new Set(statementsDoMes(statements, mes).map((s) => s.id));
  for (const r of receivables) if (r.statement_id && ids.has(r.statement_id)) total += perdoadoCentavos(r);
  return reais(total);
}
```

⚠️ `dashboard.ts` continua **sem** mencionar a tabela, `recebido_em` ou `valor_recebido` (o caso [8] do bloco 5 e a varredura vigiam).

Run: `npx vitest run src/lib/finance/dashboard-recebimentos.test.ts src/lib/finance/dashboard.test.ts`
Expected: PASS nos dois (`dashboard.test.ts` **sem edição**).

- [ ] **Step 3: A caracterização — só C1–C7 e C9–C12**

Run: `npx vitest run src/lib/finance/dashboard-caracterizacao.test.ts` — Expected: FAIL **exatamente** nos casos do §7 do spec. Se cair qualquer outro, **pare** e reporte.

Edite, uma a uma, exatamente como o §7:
- **C1** (bloco 1, "congela o objeto completo…"): `meu: 300.55`, `terceiros: 120.05`, `cartaoMeu: 220.3`.
- **C2** (bloco 1, "soma responsabilidade original…"): nome → `"soma responsabilidade original de terceiros sem filtrar status (exceto \`ignorado\`, D11) nem ref_month"`; `meu: 40`, `terceiros: 60`, `cartaoMeu: 40`.
- **C3** (bloco 1, "preserva meu negativo…"): o recebível da fixture `status: "ignorado"` → `status: "pendente"`; asserções idênticas.
- **C4** (bloco 2): Viagem `meu: 230`.
- **C5** (bloco 3, "congela uma fatura real e uma virtual…"): a real com `meu: 80.15`, `terceiros: 20.1`.
- **C6** (bloco 5, [1]): só `expect(resumo9("ignorado").cartaoMeu).toBe(1000);` com o comentário `// D11 (03-D): perdoar não é "o terceiro paga" — o valor perdoado vira despesa minha.`
- **C7** (bloco 5, [2]): nome → `"[2 ✅] a responsabilidade original do terceiro é R$ 600 enquanto ele deve; perdoado, é zero (D11)"`; laço em `["pendente", "cobrado", "pago"]` e `expect(resumo9("ignorado").terceiros).toBe(0);`.
- **C9/C10/C11** (bloco 8): `"ignorado"` sai das três listas de `it.each` (a de `resumoMes` mantém `"status-inventado"`).
- **C12** (bloco 8): nome → `"D11 — \`ignorado\` vira despesa minha: 400 → 500"`; comentário atualizado; `expect(r.cartaoMeu).toBe(500); expect(r.cartaoMeu).not.toBe(400);`.

Run: `npx vitest run src/lib/finance/` — Expected: PASS.
Confira: `git diff 17a93e9 -- src/lib/finance/dashboard-caracterizacao.test.ts` mostra **só** essas edições.

- [ ] **Step 4: Relatórios, card e telas**

- `reports/queries.ts`: no laço `recByStatement`, `+ r.valor` → `+ centavosParaReais(parteDoTerceiroCentavos(r))` (mantendo a acumulação em reais — RR-D-5); `finance.perdoado = perdoadoDoMes({ mes: mesSel, transactions: txs, statements: sts, receivables: recs })` e o tipo do `finance` ganha `perdoado: number`.
- `dashboard/queries.ts` (`getFinanceCardData`) e `dashboard/types.ts` (`FinanceCardData`): `perdoado: perdoadoDoMes({ mes, transactions: txs, statements: sts, receivables: recs })`. Acrescente `perdoado: 0` às fixtures de `FinanceCardData` que o `tsc` apontar.
- `finance-card.tsx`: o `hint` de "Realmente meu" vira `[`de ${formatCurrency(d.saidas)} movimentados`, fraseDoPerdoado(d.perdoado)].filter(Boolean).join(" · ")`.
- `dashboard/financeiro/page.tsx`: passa `perdoado={perdoadoDoMes(...)}` ao cliente; `financial-dashboard-client.tsx`: o card da minha parte ganha a mesma linha (via `fraseDoPerdoado`).
- `relatorios-client.tsx`: o `hint` de "Saídas do mês" vira ``[`meu ${formatCurrency(finance.resumo.meu)}`, fraseDoPerdoado(finance.perdoado)].filter(Boolean).join(" · ")``.

Run: `npx vitest run src/lib/ src/app/ && npx tsc --noEmit && npm run lint`
Expected: verde e limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/dashboard.ts src/lib/finance/dashboard-recebimentos.test.ts src/lib/finance/dashboard-caracterizacao.test.ts src/lib/reports/queries.ts src/lib/dashboard/queries.ts src/lib/dashboard/types.ts src/components/dashboard/general/finance-card.tsx "src/app/(app)/dashboard/financeiro/page.tsx" "src/app/(app)/dashboard/financeiro/financial-dashboard-client.tsx" "src/app/(app)/relatorios/relatorios-client.tsx" src/lib/ai/tools/adapters/finance.test.ts src/lib/ai/insights/collectors/finance.test.ts
git commit -F - <<'EOF'
feat(redesign): 03-D B1a — D11: o perdoado vira despesa minha no motor, relatorios e cards

O que muda de natureza: ignorado sai da soma de terceiros (fatura, parcela,
proximas faturas, a vista por transaction_id); perdoadoDoMes mostra "inclui R$ X
que voce decidiu nao cobrar". Sintetico: ignorado 600 → minha parte 400 → 1000;
com 250 recebidos → 750 (K3-a). Efeito hoje: zero (0 ignorado).
Caracterizacao: so C1–C7 e C9–C12 do spec §7. dashboard.test.ts intacto.

Co-Authored-By: <a linha que o seu ambiente indicar>
EOF
```

---

### Task 11: B1b — D11 em `/faturas` e `/parcelamentos`

**Files:**
- Modify: `src/lib/finance/recebimentos.ts` (dois apoios) + `recebimentos.test.ts`
- Modify: `src/app/(app)/faturas/statements-client.tsx`
- Modify: `src/app/(app)/parcelamentos/installments-client.tsx`
- Create: `src/app/(app)/faturas/faturas-terceiros.test.ts`

**Interfaces:**
- Produces em `recebimentos.ts`: `somaDaParteDosTerceiros(recs: readonly RecebivelComRecebimentos[]): number` e `somaDoPerdoado(recs: readonly RecebivelComRecebimentos[]): number` (reais, via `resumirRecebivel` + `parteDoTerceiroCentavos`/`perdoadoCentavos`).

- [ ] **Step 1: Os apoios (teste → implementação)**

Em `recebimentos.test.ts`:

```ts
it("somas por lista: parte dos terceiros e perdoado (B1b)", () => {
  const lista = [
    rec({ valor: 600, status: "ignorado", recebimentos: [{ valor: 250, recebido_em: "2026-06-05" }] }),
    rec({ valor: 100, status: "pago", pago_em: "2026-06-01" }),
  ];
  expect(somaDaParteDosTerceiros(lista)).toBe(350);
  expect(somaDoPerdoado(lista)).toBe(350);
});
```

```ts
export function somaDaParteDosTerceiros(recs: readonly RecebivelComRecebimentos[]): number {
  return centavosParaReais(recs.reduce((s, r) => s + parteDoTerceiroCentavos(resumirRecebivel(r)), 0));
}
export function somaDoPerdoado(recs: readonly RecebivelComRecebimentos[]): number {
  return centavosParaReais(recs.reduce((s, r) => s + perdoadoCentavos(resumirRecebivel(r)), 0));
}
```

- [ ] **Step 2: A fiação (vermelho)**

`src/app/(app)/faturas/faturas-terceiros.test.ts` — varredura dos dois clientes (sem comentários): os dois importam `somaDaParteDosTerceiros` (ou `parteDoTerceiroCentavos`) e `fraseDoPerdoado` de `@/lib/finance/recebimentos`, e **nenhum** acumula `r.valor` cru numa soma de terceiros (`expect(FONTE).not.toMatch(/sum \+ r\.valor|\+ r\.valor\)|\+= r\.valor/)`).

- [ ] **Step 3: As duas telas**

- `/faturas`: o total de terceiros por fatura vira `somaDaParteDosTerceiros(rec)`; `meu = s.total_atual - terceiros`; quando `somaDoPerdoado(rec) > 0`, a linha "meu …" ganha ` · ${fraseDoPerdoado(...)}`. Em `partesPorItem`, a parte de cada pessoa soma `parteDoTerceiroCentavos(resumirRecebivel(r)) / 100`; a pessoa com perdoado aparece com "não será cobrado {valor}" em vez de sumir.
- `/parcelamentos`: `porPessoa` soma `parteDoTerceiroCentavos(resumirRecebivel({ ...r, recebimentos: r.recebimentos ?? [] })) / 100`; `terceirosPorParcela` idem; `meu = totalAtivo − terceirosTotal`; a linha do perdoado onde o "meu" aparece.

Run: `npx vitest run src/app/ src/lib/finance/ && npx tsc --noEmit && npm run lint && npm run build && npm run perf:bundle`
Expected: verde; anote `/(app)/faturas` e `/(app)/parcelamentos` antes × depois.

- [ ] **Step 4: Commit**

```bash
git add src/lib/finance/recebimentos.ts src/lib/finance/recebimentos.test.ts "src/app/(app)/faturas/statements-client.tsx" "src/app/(app)/parcelamentos/installments-client.tsx" "src/app/(app)/faturas/faturas-terceiros.test.ts"
git commit -F - <<'EOF'
feat(redesign): 03-D B1b — D11 em /faturas e /parcelamentos

O que muda de natureza: as duas telas somam a parte dos terceiros pela regra unica
(ignorado → o recebido) e mostram o perdoado. Efeito hoje: zero (0 ignorado).
Bundle: /faturas <a> → <b>; /parcelamentos <a> → <b> KB gz.

Co-Authored-By: <a linha que o seu ambiente indicar>
EOF
```

---

### Task 12: B2 — os rótulos distintos

**Files:**
- Modify: `src/components/dashboard/general/finance-card.tsx`, `invoices-card.tsx`, `src/app/(app)/dashboard/financeiro/financial-dashboard-client.tsx`, `src/app/(app)/relatorios/relatorios-client.tsx`
- Create: `src/lib/finance/rotulos-do-pendente.test.ts`

- [ ] **Step 1: A varredura (vermelho)** — `rotulos-do-pendente.test.ts` lê os quatro arquivos (sem comentários) e afirma: nenhum contém `"A receber de terceiros"`; `finance-card`, `financial-dashboard-client` e `relatorios-client` chamam `rotuloPendenteDoMes(`; `invoices-card` chama `rotuloTotalPendenteAte(`.

- [ ] **Step 2: Os rótulos** — `finance-card`: `label={rotuloPendenteDoMes(window.mes)}`; `invoices-card`: `label={rotuloTotalPendenteAte(todayIso)}`; `financial-dashboard-client`: `rotuloPendenteDoMes(mesSel)`; `relatorios-client` (os dois `StatCard`): `rotuloPendenteDoMes(finance.mes)`. Nenhum número muda.

Run: `npx vitest run src/lib/finance/rotulos-do-pendente.test.ts && npx tsc --noEmit && npm run lint` — PASS.

- [ ] **Step 3: Commit** — `feat(redesign): 03-D B2 — "Pendente referente a {mes}" x "Total pendente ate DD/MM"` (corpo: só texto; cinco rótulos; o do indicador da IA fica de fora, RR-D-6).

---

### Task 13: B3 — "Recebido no mês" pelos recebimentos

**Files:**
- Modify: `src/app/(app)/terceiros/terceiros-client.tsx`
- Modify: `src/app/(app)/terceiros/terceiros-client.test.ts`
- Modify: `src/lib/finance/recebimentos.test.ts` (o sintético do B3)

- [ ] **Step 1: Testes (vermelho)**
  - `recebimentos.test.ts`: o sintético do spec §6.4 — junho **350**, julho **350**; e a equivalência: só legados com `pago_em` → `reembolsosRecebidosNoPeriodo` = Σ `valor` dos `pago` com `pago_em` no mês (a conta antiga).
  - `terceiros-client.test.ts`: a fonte chama `reembolsosRecebidosNoPeriodo(` e não contém mais `r.pago_em?.slice(0, 7) === currentMonth`.

- [ ] **Step 2: A tela** — `recebidoNoMes = reembolsosRecebidosNoPeriodo(receivables, { de: \`${currentMonth}-01\`, ate: \`${currentMonth}-31\` })`; rótulo `Reembolsos recebidos em ${monthYearLabel(...)}` (o `hint` vira "pela data do recebimento").

Run: `npx vitest run "src/app/(app)/terceiros/" src/lib/finance/recebimentos.test.ts && npx tsc --noEmit` — PASS.

- [ ] **Step 3: Commit** — `feat(redesign): 03-D B3 — "Recebido no mes" sai dos recebimentos (+ legado K0)` (corpo com o sintético 100→350 / 600→350 e a equivalência de hoje).

---

### Task 14: B4 — "a receber" é o saldo

**Files:**
- Modify: `src/lib/finance/dashboard.ts` (`totalAReceber`)
- Modify: `src/lib/finance/dashboard-recebimentos.test.ts` (Y9, Y16, Y19, equivalência)
- Modify: `src/lib/finance/dashboard-caracterizacao.test.ts` — **só** C8 (nome)
- Modify: `src/lib/notifications/cron.ts` (o sino com o saldo)
- Modify: `src/app/(app)/terceiros/terceiros-client.tsx` + `page.tsx` (`hoje` como prop)
- Modify: `src/lib/ai/tools/registry.ts` + `src/lib/ai/tools/registry.test.ts`

- [ ] **Step 1: Testes (vermelho)** — em `dashboard-recebimentos.test.ts`:

```ts
describe("B4 — 'a receber' é o saldo", () => {
  it("totalAReceber: 600 com 250 recebidos → 350 (com e sem mês)", () => {
    const recs = [rec({ recebido: 250, ref_month: "2026-06" })];
    expect(totalAReceber(recs)).toBe(350);
    expect(totalAReceber(recs, "2026-06")).toBe(350);
  });

  it("D3 — o [1] do §9 COM recebimento parcial: minha despesa continua 400", () => {
    const r = resumo([rec({ recebido: 250 })]);
    expect([r.cartaoMeu, r.terceiros]).toEqual([400, 600]);
  });

  it("reembolso não é renda: entradas e entradasMeu não sobem com o recebido", () => {
    const r = resumo([rec({ recebido: 250 })]);
    expect([r.entradas, r.entradasMeu]).toEqual([0, 0]);
  });

  it("sem recebimento, o número é o de antes (equivalência com o dado de hoje)", () => {
    const recs = [
      rec({ status: "pendente", valor: 10.1 }),
      rec({ status: "cobrado", valor: 20.2 }),
      { statement_id: null, installment_id: null, valor: 30.3, status: "pago" },
      rec({ status: "ignorado", valor: 40.4 }),
    ];
    const antigo = recs
      .filter((r) => r.status === "pendente" || r.status === "cobrado")
      .reduce((s, r) => s + Math.round(r.valor * 100), 0) / 100;
    expect(totalAReceber(recs)).toBe(antigo);
  });
});
```

(importe `totalAReceber`). Em `registry.test.ts`: a descrição de `finance.get_spending` contém `"o devido menos o que já foi recebido"`.

- [ ] **Step 2: O motor** — `totalAReceber(receivables, mes?)` passa a `return pendenteDoPeriodo(receivables, mes);` (importado de `@/lib/finance/recebimentos`; `RECEIVABLE_OPEN_STATUSES` some do import se ficar sem uso). Comentário: "B4 (03-D): o saldo dos em aberto, pelo estado derivado — a soma manda".

Run: `npx vitest run src/lib/finance/` — os blocos 4, 8, 9 e 10 da caracterização e `dashboard.test.ts` **ficam verdes sem edição** (recebido ausente = K0). Se algum cair, **pare**.

- [ ] **Step 3: C8** — no bloco 5, só o **nome** do [3+4]: `"[3+4] reescrever o \`valor\` NÃO é o jeito de dizer 'restam R$ 350' — o preço continua medido (a 03-D os representa por recebimento)"`.

- [ ] **Step 4: O sino, `/terceiros` e a IA**
  - `cron.ts`: `genReceivables` passa a ser montado das linhas **já juntadas** com os recebimentos: só as `emAberto(resumirRecebivel(r))`, com `valor: saldoCentavos(resumirRecebivel(r)) / 100`. `generate.ts` não muda.
  - `/terceiros`: `page.tsx` passa `hoje={hojeISO()}`; "Total a receber" vira `totalPendenteAte(receivables, hoje)` com o rótulo `rotuloTotalPendenteAte(hoje)` e o hint "Pendente + cobrado, descontado o que já foi recebido"; "A receber de {nome}" vira `Pendente de ${nome}` com Σ saldo dos em aberto da pessoa (`pendenteDoPeriodo(secoes.emAberto.map(resumirRecebivel))`); no lote, `alcanceDaAcao` recebe `valor: emAberto(res) ? saldoCentavos(res) / 100 : r.valor`.
  - `registry.ts`: em `finance.get_spending`, "a receber" → "a receber (o que ainda falta receber de terceiros: o devido menos o que já foi recebido)".

Run: `npx vitest run src/lib/ src/app/ && npx tsc --noEmit && npm run lint` — PASS.

- [ ] **Step 5: Commit** — `feat(redesign): 03-D B4 — "a receber" passa a ser o saldo` (corpo: sintético 600→350 no a receber, minha despesa 400 nos dois; sino com o saldo; a descrição da IA no mesmo commit (invariante 100); C8 só o nome; efeito hoje zero).

---

### Task 15: Mutações, os cinco comandos e o resultado no spec

**Files:**
- Modify: `docs/superpowers/specs/2026-10-11-03d-recebiveis-design.md` (acrescenta `## 13. Resultado`)

- [ ] **Step 1: As mutações Y1–Y31, uma a uma**

Para cada linha: aplique **só** aquela mudança; `npx tsc --noEmit` (tem de compilar); rode o teste indicado; registre o **NOME** de cada teste que caiu; restaure com `git checkout -- <arquivos>` e confira com `git diff --quiet` (nunca pelo verde).

| # | Mutação concreta | Rode |
| --- | --- | --- |
| Y1 | apague `alter table public.receivable_receipts force row level security;` | `m1-recebimentos.test.ts` |
| Y2 | na FK, `foreign key (receivable_id) references public.receivables (id)` | idem |
| Y3 | tire `for update` do `select r.valor into v_devido` | idem |
| Y4 | acrescente `insert into public.receivable_receipts (user_id, receivable_id, valor, recebido_em) select user_id, id, valor, pago_em from public.receivables where status = 'pago';` | idem |
| Y5 | `saldoCentavos` devolve `cent(r.valor)` | `recebimentos.test.ts` |
| Y6 | em `registrarRecebimento`, no ramo parcial, `update({ status: "parcial" })` | `recebimentos-servico.test.ts` |
| Y7 | em `split-reapply.ts`, `recebivelProtegido(r, "so-dinheiro-registrado")` → `false` (constante) | `transactions.test.ts` |
| Y8 | em `installments.ts`, apague o `if (motivo) return dbError(motivo);` | `installments.test.ts` |
| Y9 | em `parteDoTerceiroCentavos`, devolva `saldoCentavos(r)` para não-ignorado | `dashboard-recebimentos.test.ts` |
| Y10 | em `reembolsosRecebidosNoPeriodo`, filtre por `(r as { ref_month?: string | null }).ref_month` em vez de `e.data` | `recebimentos.test.ts` |
| Y11a | em `entradasDoRecebivel`, tire o `return` antecipado dos recebimentos (conta os dois) | idem |
| Y11b | apague o ramo do legado | idem |
| Y12 | em `totalPendenteAte`, tire o `.filter(...)` da data | idem |
| Y13 | em `registrarRecebimento`, o ramo `23514` devolve `dbError(...)` | `recebimentos-servico.test.ts` |
| Y14 | tire `"receivable_receipts"` de `EXPORT_TABLES` | `export-tables.test.ts` |
| Y15 | `const _t = "receivable_receipts";` em `lib/reports/queries.ts` | `quem-le-os-recebimentos.test.ts` |
| Y16 | em `resumoMes`, `entradasCent += cent(r.recebido ?? 0)` para cada recebível | `dashboard-recebimentos.test.ts` |
| Y17 | `parteDoTerceiroCentavos` devolve sempre `cent(r.valor)` | `dashboard-caracterizacao.test.ts` (C12) e `dashboard-recebimentos.test.ts` |
| Y18 | em `secoesDaLista`, `ignorado` não é empurrado em lugar nenhum | `recebimentos.test.ts` |
| Y19 | `totalAReceber` volta a `Σ cent(r.valor)` dos `RECEIVABLE_OPEN_STATUSES` | `dashboard-recebimentos.test.ts` |
| Y20 | em `desfazerUltimoRecebimento`, apague por `.eq("receivable_id", lido.id)` (todos) | `recebimentos-servico.test.ts` |
| Y21 | inverta a ordem (delete antes do update) em `desfazerUltimoRecebimento` | idem |
| Y22 | inverta a ordem (update antes do insert) em `receberSaldo` | idem |
| Y23 | apague o `if (estado === "ignorado")` de `registrarRecebimento` | idem |
| Y24 | apague o `if (dados.recebido_em > hoje)` | idem |
| Y25 | em `deleteTransaction`, apague o `if (motivo) return dbError(motivo);` | `transactions.test.ts` |
| Y26 | `parteDoTerceiroCentavos`: `estado === "ignorado" || estado === "parcial"` → recebido | `recebimentos.test.ts` |
| Y27 | `perdoadoCentavos`: tire o `- recebidoCentavos(r)` | idem |
| Y28a | o `insert` de `registrarRecebimento` ganha `conta_id: null` | `recebimentos-servico.test.ts` |
| Y28b | `registrarRecebimentoSchema` sem `.strict()` | `validators/receivable.test.ts` |
| Y29 | `ORIGENS_DA_ACAO.ignorar` volta a ter `"pago"` | `receivables-bulk.test.ts` |
| Y30 | em `montarEntradas`, não preencha `recebido` | `pipeline.test.ts` |
| Y31 | `"lib/finance/dashboard.ts"` na allowlist + `const _t = "receivable_receipts";` nele | `quem-le-os-recebimentos.test.ts` (só o caso `NUNCA`) |

Mutação que sair verde: **meça antes de chamar de fraqueza** (leia o teste, confirme que a mutação compilou e foi rodada no arquivo certo); se for fraqueza, corrija o teste, refaça a mutação e registre.

- [ ] **Step 2: Os cinco comandos na ponta**

Run: `npm run test:run`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run perf:bundle` — anote números reais; o medidor das seis rotas (spec §2.2) antes × depois; `TZ=UTC npx vitest run src/lib/finance/ src/lib/notifications/` verde.

- [ ] **Step 3: As conferências**

- `git diff --quiet 17a93e9 -- src/lib/finance/dashboard.test.ts` → 0; `git diff 17a93e9 -- src/lib/finance/dashboard-caracterizacao.test.ts` = exatamente C1–C12.
- `git diff --stat 17a93e9 -- supabase/ docs/redesign/STATUS.md CLAUDE.md AGENTS.md` → só o arquivo da M1.
- `src/types/supabase.ts` só com o que é da M1.
- `git diff 17a93e9 -- src | grep '^+' | grep -nE 'Date\.now\(\)|new Date\(\)'` → vazio.
- Banco (só leitura): recebíveis por status = 72/0/169/0 (ou o que o dono mudou pela tela, declarado em número); receitas 48, todas `pessoal`; `receivable_receipts` = 0 (ou o número que o dono registrou pela tela, sem valor nem nome).

- [ ] **Step 4: O resultado no spec e o commit**

Acrescente `## 13. Resultado — <data>, na ponta <hash>` no spec (formato do §12 da 03-C2): commits por passo; a M1 (quando, a frase literal "aplique a M1", versão remota, o que o diff dos tipos trouxe e o que ficou fora); os cinco comandos antes × depois; as mutações com os nomes dos testes que caíram; as conferências; desvios do plano; risco residual acrescentado.

```bash
git add docs/superpowers/specs/2026-10-11-03d-recebiveis-design.md
git commit -F - <<'EOF'
docs(redesign): 03-D passo final — mutacoes e verificacao registradas no desenho

Co-Authored-By: <a linha que o seu ambiente indicar>
EOF
```

E pare: sem push, sem merge. Entregue ao dono o que o spec §11 e o briefing pedem (números dos cinco comandos, mutações com nomes, K0–K3, a M1, cada item da Parte B com antes × depois no sintético e o efeito zero de hoje, desvios, limitações, risco residual novo e os destinos de RR5/RR7).
