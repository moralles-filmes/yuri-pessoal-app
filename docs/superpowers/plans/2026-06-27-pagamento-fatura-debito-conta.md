# Pagamento de Fatura com Débito em Conta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao clicar "Pagar" numa fatura, debitar uma conta bancária escolhida (via diálogo) sem duplicar gastos nos relatórios, e refletir pago/em-aberto nos lançamentos do cartão.

**Architecture:** O pagamento vira **um lançamento tipo `transferencia`** (sai da conta, fica fora de despesas/relatórios e fora do total da fatura). A fatura guarda `pago_conta_id` e `pago_transacao_id` para desfazer com precisão (deletar o lançamento → estorna o saldo). O estado "pago/em aberto" de cada lançamento de cartão é **derivado na leitura** da `pago_em` da fatura — nada de status gravado por lançamento.

**Tech Stack:** Next.js 16 (Server Components + Server Actions), Supabase (Postgres + RLS), Zod, Vitest (node), Tailwind v4 + shadcn/ui.

## Global Constraints

- **Idioma:** todo texto de UI/erro em **pt-BR**; moeda **BRL**; datas no formato brasileiro.
- **Dinheiro:** a coluna `transactions.amount` é `numeric(14,2)` (reais com 2 casas). Lógica pura que soma dinheiro usa centavos via `reaisParaCentavos`/`centavosParaReais` de `src/lib/format.ts`.
- **Funções puras:** sem `Date.now()`/`new Date()` sem argumento — `hoje` é injetado. Server Actions PODEM usar `new Date()`.
- **Contrato de Server Action:** `authContext()` → Zod `safeParse` → query Supabase com `user_id: ctx.userId` em inserts → `revalidatePath(...)` → retorna `ActionResult`. `user_id` SEMPRE de `auth.getUser()`.
- **RLS:** todas as tabelas têm RLS por `user_id`; colunas novas herdam a RLS da tabela.
- **Migrations:** SQL idempotente, timestamp `YYYYMMDDHHMMSS`, aplicado no Supabase via MCP `apply_migration` (projeto `yjvnlbjvippefvzgrxxw`); regenerar `src/types/supabase.ts` via MCP `generate_typescript_types`.
- **UI:** manter dark/light + responsividade.
- **Verificação de "pronto":** `npm run test:run` + `npm run lint` + `npx tsc --noEmit` + `npm run build`.

---

### Task 1: Migration — colunas de pagamento na fatura + regenerar tipos

**Files:**
- Create: `supabase/migrations/20260627140000_card_statements_pagamento.sql`
- Modify (gerado): `src/types/supabase.ts`

**Interfaces:**
- Produces: colunas `card_statements.pago_conta_id uuid | null` e `card_statements.pago_transacao_id uuid | null`, refletidas em `src/types/supabase.ts` (tabela `card_statements`, Row/Insert/Update).

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260627140000_card_statements_pagamento.sql`:

```sql
-- Pagamento de fatura com débito em conta (manutenção).
-- Ao pagar, o sistema cria UM lançamento tipo 'transferencia' (debita a conta escolhida, fica
-- fora de despesas/relatórios e fora do total da fatura) e guarda aqui qual conta pagou e qual
-- lançamento representa o pagamento — para "Desfazer" deletar esse lançamento e estornar o saldo.
-- Idempotente (add column if not exists). A RLS da tabela já cobre as novas colunas.
-- ON DELETE SET NULL: apagar a conta ou o lançamento não apaga a fatura.

alter table public.card_statements
  add column if not exists pago_conta_id uuid
    references public.accounts(id) on delete set null,
  add column if not exists pago_transacao_id uuid
    references public.transactions(id) on delete set null;
```

- [ ] **Step 2: Aplicar a migration**

Aplicar via MCP Supabase `apply_migration` (projeto `yjvnlbjvippefvzgrxxw`), `name: "card_statements_pagamento"`, com o SQL acima.

- [ ] **Step 3: Verificar que as colunas existem**

Via MCP Supabase `execute_sql`:

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'card_statements'
  and column_name in ('pago_conta_id','pago_transacao_id')
order by column_name;
```
Esperado: 2 linhas (`pago_conta_id`, `pago_transacao_id`), ambas `uuid`.

- [ ] **Step 4: Regenerar os tipos TypeScript**

Via MCP Supabase `generate_typescript_types` e salvar o resultado em `src/types/supabase.ts` (sobrescreve o arquivo). Confirmar que `card_statements` Row agora inclui `pago_conta_id: string | null` e `pago_transacao_id: string | null`.

- [ ] **Step 5: Checar tipos**

Run: `npx tsc --noEmit`
Esperado: sem erros (mudança aditiva).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260627140000_card_statements_pagamento.sql src/types/supabase.ts
git commit -m "feat(faturas): colunas de pagamento (pago_conta_id, pago_transacao_id)"
```

---

### Task 2: Lógica pura — montar o payload do pagamento (TDD)

**Files:**
- Create: `src/lib/finance/statement-payment.ts`
- Test: `src/lib/finance/statement-payment.test.ts`

**Interfaces:**
- Produces:
  - `type PagamentoFaturaPayload` (objeto de insert sem `user_id`).
  - `descricaoPagamentoFatura(cartaoNome: string, competencia: string): string`
  - `montarPagamentoFatura(params: { contaId: string; total: number; cartaoNome: string; competencia: string; hoje: string }): PagamentoFaturaPayload`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/finance/statement-payment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  descricaoPagamentoFatura,
  montarPagamentoFatura,
} from "@/lib/finance/statement-payment";

describe("montarPagamentoFatura", () => {
  const base = {
    contaId: "11111111-1111-1111-1111-111111111111",
    total: 693.07,
    cartaoNome: "Nubank",
    competencia: "2026-07-01",
    hoje: "2026-06-27",
  };

  it("é uma transferência paga, fora da fatura e dos relatórios", () => {
    const p = montarPagamentoFatura(base);
    expect(p.type).toBe("transferencia");
    expect(p.status).toBe("pago");
    expect(p.payment_method).toBe("transferencia");
    // Fora da fatura e do saldo de cartão: sem vínculo de cartão/fatura e sem 2ª perna.
    expect(p.card_id).toBeNull();
    expect(p.statement_id).toBeNull();
    expect(p.transfer_account_id).toBeNull();
    expect(p.transfer_group_id).toBeNull();
  });

  it("debita a conta escolhida pelo total cheio da fatura", () => {
    const p = montarPagamentoFatura(base);
    expect(p.account_id).toBe(base.contaId);
    expect(p.amount).toBe(693.07);
  });

  it("usa a data injetada (hoje) como compra e competência", () => {
    const p = montarPagamentoFatura(base);
    expect(p.purchase_date).toBe("2026-06-27");
    expect(p.competence_date).toBe("2026-06-27");
  });

  it("descreve o pagamento com o cartão e o ano da competência", () => {
    const desc = descricaoPagamentoFatura("Nubank", "2026-07-01");
    expect(desc).toContain("Pagamento fatura");
    expect(desc).toContain("Nubank");
    expect(desc).toContain("2026");
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/finance/statement-payment.test.ts`
Esperado: FAIL (módulo `statement-payment` não existe).

- [ ] **Step 3: Implementar o módulo**

Criar `src/lib/finance/statement-payment.ts`:

```ts
/**
 * Lógica PURA do pagamento de fatura (testada em statement-payment.test.ts).
 *
 * O pagamento de uma fatura de cartão é modelado como uma TRANSFERÊNCIA: o dinheiro sai da
 * conta escolhida para quitar o cartão. Por ser `transferencia` (não `despesa`), fica FORA de
 * entradas/saídas dos relatórios (ver dashboard.ts) e a view `card_statements_with_total` não o
 * soma — então NÃO duplica os gastos do cartão, que já entram via total da fatura.
 *
 * Sem efeitos colaterais e sem Date.now(): `hoje` ('yyyy-MM-dd') é sempre injetado.
 */

export type PagamentoFaturaPayload = {
  type: "transferencia";
  payment_method: "transferencia";
  status: "pago";
  account_id: string;
  transfer_account_id: null;
  transfer_group_id: null;
  card_id: null;
  statement_id: null;
  category_id: null;
  subcategory_id: null;
  amount: number;
  purchase_date: string;
  competence_date: string;
  description: string;
};

/** "Pagamento fatura {mês/ano} — {cartão}" (mês por extenso, pt-BR). */
export function descricaoPagamentoFatura(
  cartaoNome: string,
  competencia: string,
): string {
  const [y, m] = competencia.split("-").map(Number);
  const mesAno = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
  return `Pagamento fatura ${mesAno} — ${cartaoNome}`;
}

export function montarPagamentoFatura(params: {
  contaId: string;
  total: number;
  cartaoNome: string;
  /** Competência da fatura ('yyyy-MM-01'). */
  competencia: string;
  /** Data do pagamento ('yyyy-MM-dd'), injetada. */
  hoje: string;
}): PagamentoFaturaPayload {
  const { contaId, total, cartaoNome, competencia, hoje } = params;
  return {
    type: "transferencia",
    payment_method: "transferencia",
    status: "pago",
    account_id: contaId,
    transfer_account_id: null,
    transfer_group_id: null,
    card_id: null,
    statement_id: null,
    category_id: null,
    subcategory_id: null,
    amount: total,
    purchase_date: hoje,
    competence_date: hoje,
    description: descricaoPagamentoFatura(cartaoNome, competencia),
  };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/finance/statement-payment.test.ts`
Esperado: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/statement-payment.ts src/lib/finance/statement-payment.test.ts
git commit -m "feat(faturas): lógica pura do pagamento de fatura (transferência)"
```

---

### Task 3: Actions — `markStatementPaid(id, contaId)` e `markStatementUnpaid(id)`

**Files:**
- Create: `src/lib/validators/statement.ts`
- Modify: `src/lib/actions/statements.ts`

**Interfaces:**
- Consumes: `montarPagamentoFatura` (Task 2), colunas `pago_conta_id`/`pago_transacao_id` (Task 1).
- Produces:
  - `markStatementPaid(id: string, contaId: string): Promise<ActionResult>`
  - `markStatementUnpaid(id: string): Promise<ActionResult>` (assinatura mantida)
  - `pagamentoFaturaSchema` (Zod).

- [ ] **Step 1: Criar o validator**

Criar `src/lib/validators/statement.ts`:

```ts
import { z } from "zod";

/** Entrada do pagamento de fatura: a fatura e a conta a debitar. */
export const pagamentoFaturaSchema = z.object({
  id: z.string().uuid({ message: "Fatura inválida" }),
  contaId: z.string().uuid({ message: "Selecione a conta" }),
});
```

- [ ] **Step 2: Reescrever `markStatementPaid` e ampliar a revalidação**

Em `src/lib/actions/statements.ts`, trocar os imports do topo e a função `revalidateStatements`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  authContext,
  dbError,
  invalid,
  notAuthed,
} from "@/lib/actions/helpers";
import { montarPagamentoFatura } from "@/lib/finance/statement-payment";
import { pagamentoFaturaSchema } from "@/lib/validators/statement";
import { toDateInputValue } from "@/lib/format";
import type { ActionResult } from "@/types/finance";

function revalidateStatements() {
  revalidatePath("/faturas");
  revalidatePath("/cartoes");
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/contas");
}
```

Substituir TODA a função `markStatementPaid` por:

```ts
/**
 * Paga a fatura: cria UM lançamento de pagamento (transferência que debita a conta escolhida)
 * e marca a fatura como paga, guardando a conta e o lançamento para o "Desfazer".
 * O valor é o total da fatura no momento do pagamento.
 */
export async function markStatementPaid(
  id: string,
  contaId: string,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = pagamentoFaturaSchema.safeParse({ id, contaId });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  // Fatura com total calculado (view) — precisamos de competência e total.
  const { data: st, error: loadErr } = await ctx.supabase
    .from("card_statements_with_total")
    .select("id, card_id, competencia, pago_em, total_atual")
    .eq("id", id)
    .single();
  if (loadErr || !st) return dbError("Fatura não encontrada.");
  if (st.pago_em) return dbError("Esta fatura já está paga.");

  const total = st.total_atual ?? 0;
  if (total <= 0) return dbError("Não há valor a pagar nesta fatura.");

  // Conta deve existir e ser do usuário (RLS garante o dono).
  const { data: conta } = await ctx.supabase
    .from("accounts")
    .select("id")
    .eq("id", contaId)
    .single();
  if (!conta) return dbError("Conta não encontrada.");

  const { data: card } = await ctx.supabase
    .from("credit_cards")
    .select("nome")
    .eq("id", st.card_id)
    .single();

  const payload = montarPagamentoFatura({
    contaId,
    total,
    cartaoNome: card?.nome ?? "Cartão",
    competencia: st.competencia,
    hoje: toDateInputValue(new Date()),
  });

  const { data: pago, error: insErr } = await ctx.supabase
    .from("transactions")
    .insert({ user_id: ctx.userId, ...payload })
    .select("id")
    .single();
  if (insErr || !pago) return dbError("Não foi possível registrar o pagamento.");

  const { error: updErr } = await ctx.supabase
    .from("card_statements")
    .update({
      status: "paga",
      pago_em: new Date().toISOString(),
      pago_conta_id: contaId,
      pago_transacao_id: pago.id,
    })
    .eq("id", id);
  if (updErr) {
    // Compensação (sem transação multi-statement no client): desfaz o lançamento criado.
    await ctx.supabase.from("transactions").delete().eq("id", pago.id);
    return dbError("Não foi possível marcar a fatura como paga.");
  }

  revalidateStatements();
  return { ok: true, data: undefined };
}
```

- [ ] **Step 3: Reescrever `markStatementUnpaid` para estornar o pagamento**

Substituir TODA a função `markStatementUnpaid` por:

```ts
/**
 * Desfaz o pagamento: deleta o lançamento de pagamento (estorna o saldo da conta) e limpa os
 * campos de pagamento. Os lançamentos do cartão voltam a "em aberto" (derivado da fatura).
 */
export async function markStatementUnpaid(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: st } = await ctx.supabase
    .from("card_statements")
    .select("pago_transacao_id")
    .eq("id", id)
    .single();

  if (st?.pago_transacao_id) {
    await ctx.supabase
      .from("transactions")
      .delete()
      .eq("id", st.pago_transacao_id);
  }

  const { error } = await ctx.supabase
    .from("card_statements")
    .update({
      status: "aberta",
      pago_em: null,
      pago_conta_id: null,
      pago_transacao_id: null,
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível desfazer o pagamento.");
  revalidateStatements();
  return { ok: true, data: undefined };
}
```

> Mantenha `moveTransactionToStatement` como está (não alterar).

- [ ] **Step 4: Checar tipos**

Run: `npx tsc --noEmit`
Esperado: sem erros. (Se `st.total_atual`/`competencia` acusarem nullable, lembre que a view os declara nullable — o `?? 0` e o uso direto de `competencia` em string já cobrem; se `tsc` reclamar de `competencia` possivelmente null, troque por `st.competencia ?? ""` no `montarPagamentoFatura`.)

- [ ] **Step 5: Rodar a suíte (sem regressão)**

Run: `npm run test:run`
Esperado: tudo verde (as actions não têm teste de DB; os testes puros de Task 2 passam).

- [ ] **Step 6: Commit**

```bash
git add src/lib/validators/statement.ts src/lib/actions/statements.ts
git commit -m "feat(faturas): pagar fatura debita conta; desfazer estorna o saldo"
```

---

### Task 4: Exibir pago/em-aberto derivado da fatura nos lançamentos

**Files:**
- Modify: `src/types/database.ts:136-142` (tipo `TransactionWithRelations`)
- Modify: `src/lib/finance/queries.ts:25-26` (`TX_SELECT`)
- Modify: `src/app/(app)/financeiro/lancamentos/transactions-client.tsx:145-154`

**Interfaces:**
- Consumes: `card_statements.pago_em` (já existente).
- Produces: `TransactionWithRelations.statement: Pick<CardStatementRow, "id" | "pago_em"> | null`.

- [ ] **Step 1: Adicionar `statement` ao tipo**

Em `src/types/database.ts`, na definição de `TransactionWithRelations` (linha ~136), acrescentar o campo `statement`:

```ts
/** Lançamento já com as relações resolvidas (para listas e detalhes). */
export type TransactionWithRelations = TransactionRow & {
  account: Pick<AccountRow, "id" | "name" | "color"> | null;
  transfer_account: Pick<AccountRow, "id" | "name"> | null;
  category: Pick<CategoryRow, "id" | "name" | "color" | "icon"> | null;
  subcategory: Pick<SubcategoryRow, "id" | "name"> | null;
  card: Pick<CreditCardRow, "id" | "nome" | "cor" | "bandeira"> | null;
  // Fatura do lançamento de cartão — permite derivar pago/em-aberto na leitura.
  statement: Pick<CardStatementRow, "id" | "pago_em"> | null;
};
```

- [ ] **Step 2: Incluir a fatura no select**

Em `src/lib/finance/queries.ts`, alterar a constante `TX_SELECT` (linha 25-26) para embutir a fatura:

```ts
const TX_SELECT =
  "*, account:accounts!transactions_account_id_fkey(id,name,color), transfer_account:accounts!transactions_transfer_account_id_fkey(id,name), category:categories(id,name,color,icon), subcategory:subcategories(id,name), card:credit_cards(id,nome,cor,bandeira), statement:card_statements(id,pago_em)";
```

- [ ] **Step 3: Garantir que nada constrói `TransactionWithRelations` sem `statement`**

Run: `npx tsc --noEmit`
Esperado: sem erros. Se algum ponto construir o objeto manualmente (literal) e o compilador reclamar de `statement` faltando, adicionar `statement: null` ali. (As leituras via Supabase usam cast `as unknown as TransactionWithRelations`, que não reclama.)

- [ ] **Step 4: Derivar o badge para itens de cartão**

Em `src/app/(app)/financeiro/lancamentos/transactions-client.tsx`, no bloco do badge (linhas 145-154), trocar o ternário `parcelado ? … : <StatusBadge status={t.status} />` por uma terceira via para cartão:

```tsx
{t.parcelado ? (
  <Badge
    variant="secondary"
    className="border-0 bg-primary/10 text-primary"
  >
    Parcelado {t.qtd_parcelas}x
  </Badge>
) : t.card ? (
  // Cartão: pago/em-aberto é DERIVADO da fatura (não do status gravado).
  <StatusBadge status={t.statement?.pago_em ? "pago" : "pendente"} />
) : (
  <StatusBadge status={t.status} />
)}
```

- [ ] **Step 5: Checar tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts src/lib/finance/queries.ts "src/app/(app)/financeiro/lancamentos/transactions-client.tsx"
git commit -m "feat(lançamentos): cartão exibe pago/em-aberto derivado da fatura"
```

---

### Task 5: Diálogo de pagamento na tela de Faturas

**Files:**
- Modify: `src/app/(app)/faturas/page.tsx`
- Modify: `src/app/(app)/faturas/statements-client.tsx`

**Interfaces:**
- Consumes: `markStatementPaid(id, contaId)` (Task 3), `getAccounts()` (existente em `queries.ts:28`).
- Produces: prop nova `accounts: { id: string; name: string }[]` em `StatementsClient`; componente interno `PayStatementDialog`.

- [ ] **Step 1: Carregar e passar as contas ativas na página**

Em `src/app/(app)/faturas/page.tsx`:

Adicionar `getAccounts` ao import de `@/lib/finance/queries` (linha 3-9):

```ts
import {
  getAccounts,
  getCreditCards,
  getReceivablesByStatements,
  getStatementInstallmentItems,
  getStatements,
  getTransactions,
} from "@/lib/finance/queries";
```

Carregar as contas logo após `const cards = await getCreditCards();` (linha 26):

```ts
  const cards = await getCreditCards();
  const accounts = await getAccounts();
```

Passar ao client (dentro do JSX `<StatementsClient ... />`, junto às outras props):

```tsx
        accounts={accounts
          .filter((a) => a.is_active)
          .map((a) => ({ id: a.id, name: a.name }))}
```

- [ ] **Step 2: Receber a prop `accounts` no client**

Em `src/app/(app)/faturas/statements-client.tsx`, na assinatura de `StatementsClient` (linhas 95-115), adicionar `accounts` aos parâmetros e ao tipo:

```tsx
export function StatementsClient({
  cards,
  statements,
  transactions,
  installmentItems,
  receivables,
  accounts,
  today,
  selectedCardId,
  month,
  status,
}: {
  cards: CardOption[];
  statements: CardStatementWithTotal[];
  transactions: TransactionWithRelations[];
  installmentItems: StatementInstallmentItem[];
  receivables: ReceivableWithPerson[];
  accounts: { id: string; name: string }[];
  today: string;
  selectedCardId: string | null;
  month: string | null;
  status: string | null;
}) {
```

- [ ] **Step 3: Remover `handlePay` (substituído pelo diálogo)**

Em `statements-client.tsx`, apagar a função `handlePay` (linhas 259-267). Manter `handleUnpay`.

- [ ] **Step 4: Trocar o botão "Pagar" pelo diálogo**

No bloco de ações da fatura (linhas 431-448), substituir o ramo do botão Pagar por `PayStatementDialog`, desabilitando quando não há valor:

```tsx
                        {s.id && efetivo === "paga" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnpay(s.id as string)}
                          >
                            <RotateCcw /> Desfazer
                          </Button>
                        ) : s.id && s.total_atual > 0 ? (
                          <PayStatementDialog
                            statementId={s.id}
                            total={s.total_atual}
                            accounts={accounts}
                            onPaid={() => router.refresh()}
                          />
                        ) : null}
```

- [ ] **Step 5: Implementar `PayStatementDialog`**

No fim de `statements-client.tsx` (depois de `MoveTransactionDialog`), adicionar:

```tsx
function PayStatementDialog({
  statementId,
  total,
  accounts,
  onPaid,
}: {
  statementId: string;
  total: number;
  accounts: { id: string; name: string }[];
  onPaid: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [contaId, setContaId] = React.useState<string | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);

  async function handleConfirm() {
    if (!contaId) return;
    setLoading(true);
    try {
      const res = await markStatementPaid(statementId, contaId);
      if (res.ok) {
        toast.success("Fatura paga e debitada da conta.");
        setOpen(false);
        onPaid();
      } else {
        toast.error(res.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-emerald-600 hover:text-emerald-700"
        >
          <CheckCircle2 /> Pagar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar fatura</DialogTitle>
          <DialogDescription>
            Debita {formatCurrency(total)} da conta escolhida. O pagamento entra
            como transferência (não conta como nova despesa).
          </DialogDescription>
        </DialogHeader>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma conta cadastrada.{" "}
            <Link href="/financeiro/contas" className="underline">
              Cadastre uma conta
            </Link>{" "}
            para pagar a fatura.
          </p>
        ) : (
          <div className="space-y-1.5">
            <Label>Debitar da conta</Label>
            <Select value={contaId} onValueChange={setContaId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || !contaId || accounts.length === 0}
          >
            {loading ? "Pagando…" : `Pagar ${formatCurrency(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

> `Dialog*`, `Select*`, `Label`, `Button`, `CheckCircle2`, `formatCurrency`, `Link`, `markStatementPaid` e `toast` já estão importados no arquivo (ver topo). Não duplicar imports.

- [ ] **Step 6: Verificar que `markStatementPaid` não tem outros chamadores quebrados**

Run: `npx tsc --noEmit`
Esperado: sem erros (o único chamador era `handlePay`, agora substituído).

- [ ] **Step 7: Lint**

Run: `npm run lint`
Esperado: sem erros.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/faturas/page.tsx" "src/app/(app)/faturas/statements-client.tsx"
git commit -m "feat(faturas): diálogo Pagar com seleção de conta"
```

---

### Task 6: Verificação final + handoff

**Files:**
- Modify: `docs/project/CURRENT_STATUS.md`
- Modify: `docs/handoff/LAST_PHASE_SUMMARY.md`

- [ ] **Step 1: Suíte completa**

Run: `npm run test:run`
Esperado: tudo verde (incl. os 4 testes de `statement-payment.test.ts`).

- [ ] **Step 2: Lint + tipos + build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Esperado: tudo passa, sem erros.

- [ ] **Step 3: Conferência manual (dev)**

Run: `npm run dev` e em `/faturas`:
1. Numa fatura aberta com total > 0, clicar **Pagar** → diálogo abre → escolher conta → confirmar.
2. A fatura vira **paga**; em `/financeiro/lancamentos` aparece a linha "Pagamento fatura … — {cartão}" e o saldo da conta caiu pelo total.
3. Os lançamentos do cartão dessa fatura mostram **pago**; os de uma fatura ainda aberta mostram **em aberto**.
4. Os relatórios/dashboard (`/financeiro`) **não** mudam o total de despesas/cartão (sem duplicação).
5. Clicar **Desfazer** → some a linha de pagamento, o saldo volta, e os lançamentos voltam a **em aberto**.

- [ ] **Step 4: Atualizar handoff**

Em `docs/project/CURRENT_STATUS.md` e `docs/handoff/LAST_PHASE_SUMMARY.md`, registrar (1-3 linhas): pagamento de fatura agora debita conta via lançamento `transferencia` (sem duplicar relatórios); fatura guarda `pago_conta_id`/`pago_transacao_id`; itens de cartão exibem pago/em-aberto derivado da fatura; "Desfazer" estorna o saldo.

- [ ] **Step 5: Commit**

```bash
git add docs/project/CURRENT_STATUS.md docs/handoff/LAST_PHASE_SUMMARY.md
git commit -m "docs: pagamento de fatura com débito em conta"
```

---

## Self-Review (cobertura do spec)

- **Schema (2 colunas)** → Task 1. ✓
- **Lançamento de pagamento = transferência, total cheio, sem statement_id** → Task 2 (payload puro) + Task 3 (insert). ✓
- **Não duplica relatórios / fatura** → garantido por `type='transferencia'` (dashboard exclui; view só soma despesa/receita). Coberto pelos asserts de Task 2 e pela conferência manual (Task 6, passo 3.4). ✓
- **Exibição "em aberto/pago" derivada da fatura** → Task 4. ✓
- **Diálogo Pagar, sempre perguntar a conta, sem default** → Task 5 (`contaId` inicia `undefined`, confirmar desabilitado até escolher). ✓
- **Desfazer estorna o saldo (deleta o lançamento) + limpa campos** → Task 3 (`markStatementUnpaid`). ✓
- **Casos de borda: total ≤ 0 (botão escondido + bloqueio na action), já paga (bloqueio), conta excluída (FK SET NULL)** → Task 5 (`s.total_atual > 0`), Task 3 (validações), Task 1 (FKs). ✓
- **Terceiros seguem em "A Receber"** → sem mudança (débito é do total cheio; recebíveis intactos). ✓
- **Tipos/validators** → Task 3 (validator) + Task 1/Task 4 (tipos). ✓
- **Testes de lógica pura** → Task 2. ✓
